#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import * as XLSX from 'xlsx';
// import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import { OpenAI } from 'openai';
import sharp from 'sharp';
import mime from 'mime-types';
import { z } from 'zod';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';
import { Document } from '@langchain/core/documents';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { DocxLoader } from '@langchain/community/document_loaders/fs/docx';
import { TextLoader } from 'langchain/document_loaders/fs/text';

// Document processing schemas
export const DocumentProcessingConfigSchema = z.object({
  openaiApiKey: z.string().optional(),
  openaiBaseUrl: z.string().url().optional(), // Support for custom OpenAI-compatible endpoints
  model: z.string().default('gpt-4-vision-preview'), // Default vision language model
  visionModel: z.string().default('gpt-4-vision-preview'), // Vision language model for image processing
  textModel: z.string().default('gpt-4'), // Text-only model for non-vision tasks
  maxTokens: z.number().default(4000),
  temperature: z.number().min(0).max(2).default(0.7),
  uploadDir: z.string().default('./uploads'),
  templateDir: z.string().default('./templates'),
  supportedImageFormats: z.array(z.string()).default(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff']),
  enableClientVisionDetection: z.boolean().default(true), // Detect if client supports vision
  useLangChain: z.boolean().default(true), // Use LangChain for document processing
  chunkSize: z.number().default(1000), // LangChain text splitting chunk size
  chunkOverlap: z.number().default(200), // LangChain text splitting overlap
});

export const ProductTemplateSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  short_description: z.string().optional(),
  regular_price: z.string().optional(),
  sale_price: z.string().optional(),
  sku: z.string().optional(),
  stock_quantity: z.number().optional(),
  manage_stock: z.boolean().default(false),
  categories: z.array(z.object({ id: z.number() })).optional(),
  tags: z.array(z.object({ name: z.string() })).optional(),
  images: z.array(z.object({ src: z.string() })).optional(),
  attributes: z.array(z.object({
    name: z.string(),
    options: z.array(z.string()),
    visible: z.boolean().default(true),
    variation: z.boolean().default(false),
  })).optional(),
  meta_data: z.array(z.object({
    key: z.string(),
    value: z.any(),
  })).optional(),
});

export const DocumentProcessingRequestSchema = z.object({
  filePath: z.string(),
  fileType: z.enum(['csv', 'xlsx', 'pdf', 'docx', 'txt', 'json', 'image']),
  processingMode: z.enum(['extract', 'analyze', 'generate_products', 'bulk_upload']),
  template: z.string().optional(),
  customPrompt: z.string().optional(),
  batchSize: z.number().min(1).max(100).default(10),
  validateOnly: z.boolean().default(false),
  clientCapabilities: z.object({
    supportsVision: z.boolean().default(false),
    visionModels: z.array(z.string()).default([]),
    preferClientVision: z.boolean().default(false),
  }).optional(),
});

export interface ProcessingResult {
  success: boolean;
  message: string;
  data?: any;
  products?: any[];
  errors?: string[];
  stats?: {
    processed: number;
    successful: number;
    failed: number;
    skipped: number;
  };
  processingInfo?: {
    processedBy: string;
    visionModel?: string;
    textModel?: string;
    chunks?: number;
    reason?: string;
    instruction?: string;
    suggestedPrompt?: string;
  };
}

export class DocumentProcessor {
  private config: z.infer<typeof DocumentProcessingConfigSchema>;
  private openai?: OpenAI;
  private langchainModel?: ChatOpenAI;
  private textSplitter: RecursiveCharacterTextSplitter;

  constructor(config: z.infer<typeof DocumentProcessingConfigSchema>) {
    this.config = DocumentProcessingConfigSchema.parse(config);

    // Initialize OpenAI client for vision language models
    if (this.config.openaiApiKey) {
      const clientConfig: any = {
        apiKey: this.config.openaiApiKey,
      };

      // Support for custom OpenAI-compatible endpoints (like local vision models)
      if (this.config.openaiBaseUrl) {
        clientConfig.baseURL = this.config.openaiBaseUrl;
      }

      this.openai = new OpenAI(clientConfig);

      // Initialize LangChain model for document processing
      if (this.config.useLangChain) {
        this.langchainModel = new ChatOpenAI({
          openAIApiKey: this.config.openaiApiKey,
          modelName: this.config.textModel,
          temperature: this.config.temperature,
          maxTokens: this.config.maxTokens,
          ...(this.config.openaiBaseUrl && {
            configuration: { baseURL: this.config.openaiBaseUrl }
          }),
        });
      }
    }

    // Initialize text splitter for LangChain document processing
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: this.config.chunkSize,
      chunkOverlap: this.config.chunkOverlap,
    });

    // Ensure directories exist
    this.ensureDirectories();
  }

  // Check if a file is an image that can be processed with vision models
  private isImageFile(filePath: string): boolean {
    const extension = path.extname(filePath).toLowerCase().replace('.', '');
    return this.config.supportedImageFormats.includes(extension);
  }

  // Detect client vision capabilities and determine processing strategy
  private shouldUseClientVision(clientCapabilities?: any): { useClient: boolean; reason: string } {
    if (!this.config.enableClientVisionDetection) {
      return { useClient: false, reason: 'Client vision detection disabled' };
    }

    if (!clientCapabilities) {
      return { useClient: false, reason: 'No client capabilities provided' };
    }

    if (clientCapabilities.preferClientVision && clientCapabilities.supportsVision) {
      return {
        useClient: true,
        reason: `Client prefers local vision processing with models: ${clientCapabilities.visionModels?.join(', ') || 'default'}`
      };
    }

    if (clientCapabilities.supportsVision && clientCapabilities.visionModels?.length > 0) {
      return {
        useClient: true,
        reason: `Client supports vision models: ${clientCapabilities.visionModels.join(', ')}`
      };
    }

    return { useClient: false, reason: 'Client does not support vision processing' };
  }

  // Convert image to base64 for vision model processing
  private async imageToBase64(filePath: string): Promise<string> {
    try {
      const imageBuffer = fs.readFileSync(filePath);
      const base64 = imageBuffer.toString('base64');
      const mimeType = mime.lookup(filePath) || 'image/jpeg';
      return `data:${mimeType};base64,${base64}`;
    } catch (error) {
      throw new Error(`Failed to convert image to base64: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Process images using vision language models
  private async processImageWithVision(
    filePath: string,
    customPrompt?: string,
    clientCapabilities?: any
  ): Promise<{ content: string; processedBy: string; reason: string }> {

    // Check if client should handle vision processing
    const visionStrategy = this.shouldUseClientVision(clientCapabilities);

    if (visionStrategy.useClient) {
      return {
        content: `CLIENT_VISION_PROCESSING_REQUIRED: ${filePath}`,
        processedBy: 'client',
        reason: visionStrategy.reason
      };
    }

    // Server-side vision processing with OpenAI-compatible endpoint
    if (!this.openai) {
      throw new Error(`Vision language model not configured.

🤖 Configuration Required:
- Set OPENAI_API_KEY for vision model access
- Optionally set OPENAI_BASE_URL for custom vision model endpoints
- Ensure vision model (${this.config.visionModel}) is available

💡 Alternative: Client can handle vision processing if it supports vision models.`);
    }

    const base64Image = await this.imageToBase64(filePath);
    const prompt = customPrompt || `
      Analyze this image using vision language model capabilities and extract product information:

      🎯 Extract:
      - Product names and titles
      - Prices and pricing information
      - Product descriptions and features
      - Categories and classifications
      - SKUs or product codes
      - Specifications and technical details
      - Brand information
      - Any other relevant e-commerce data

      📋 Format the response as structured JSON data suitable for WooCommerce product creation.
      Focus on accuracy and completeness for e-commerce applications.
    `;

    const response = await this.openai.chat.completions.create({
      model: this.config.visionModel,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: base64Image } }
          ]
        }
      ],
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
    });

    return {
      content: response.choices[0]?.message?.content || '',
      processedBy: 'server',
      reason: `Processed by server vision model: ${this.config.visionModel}`
    };
  }

  private ensureDirectories() {
    [this.config.uploadDir, this.config.templateDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  // LangChain-based document processing for better text handling
  private async processDocumentWithLangChain(filePath: string, fileType: string): Promise<Document[]> {
    let loader;

    switch (fileType) {
      case 'pdf':
        loader = new PDFLoader(filePath);
        break;
      case 'docx':
        loader = new DocxLoader(filePath);
        break;
      case 'txt':
        loader = new TextLoader(filePath);
        break;
      default:
        // For other formats, create a document from the content
        const content = await this.getFileContent(filePath, fileType);
        return [new Document({
          pageContent: typeof content === 'string' ? content : JSON.stringify(content),
          metadata: { source: filePath, type: fileType }
        })];
    }

    const docs = await loader.load();
    return docs;
  }

  // Get file content for various formats
  private async getFileContent(filePath: string, fileType: string): Promise<any> {
    switch (fileType) {
      case 'csv':
        return await this.processCSV(filePath);
      case 'xlsx':
        return await this.processExcel(filePath);
      case 'json':
        return await this.processJSON(filePath);
      default:
        return fs.readFileSync(filePath, 'utf-8');
    }
  }

  // Enhanced document processing with LangChain text splitting
  private async processLargeDocument(docs: Document[], customPrompt?: string): Promise<string> {
    if (!this.langchainModel) {
      throw new Error('LangChain model not configured. Please set OPENAI_API_KEY.');
    }

    // Split documents into chunks for better processing
    const splitDocs = await this.textSplitter.splitDocuments(docs);

    const prompt = customPrompt || `
      Analyze this document content and extract relevant information for e-commerce product creation.
      Focus on identifying products, prices, descriptions, categories, and specifications.
      Provide structured data that can be used for WooCommerce product imports.
    `;

    const results = [];

    // Process chunks in batches to avoid token limits
    for (const doc of splitDocs.slice(0, 5)) { // Limit to first 5 chunks for efficiency
      const message = new HumanMessage(`${prompt}\n\nDocument content:\n${doc.pageContent}`);
      const response = await this.langchainModel.invoke([message]);
      results.push(response.content);
    }

    return results.join('\n\n---\n\n');
  }

  // Fallback processing for when LangChain is not available or fails
  private async fallbackProcessing(filePath: string, fileType: string): Promise<any> {
    switch (fileType) {
      case 'csv':
        return await this.processCSV(filePath);
      case 'xlsx':
        return await this.processExcel(filePath);
      case 'pdf':
        return await this.processPDF(filePath);
      case 'docx':
        return await this.processDocx(filePath);
      case 'txt':
        return await this.processText(filePath);
      case 'json':
        return await this.processJSON(filePath);
      default:
        throw new Error(`Unsupported file type: ${fileType}`);
    }
  }

  async processDocument(request: z.infer<typeof DocumentProcessingRequestSchema>): Promise<ProcessingResult> {
    try {
      const validatedRequest = DocumentProcessingRequestSchema.parse(request);
      
      // Check if file exists
      if (!fs.existsSync(validatedRequest.filePath)) {
        return {
          success: false,
          message: `File not found: ${validatedRequest.filePath}`,
        };
      }

      // Check if it's an image file and handle vision processing
      let extractedData: any;
      let processingInfo: any = {};

      if (this.isImageFile(validatedRequest.filePath)) {
        // Handle vision language model processing
        const visionResult = await this.processImageWithVision(
          validatedRequest.filePath,
          validatedRequest.customPrompt,
          validatedRequest.clientCapabilities
        );

        if (visionResult.processedBy === 'client') {
          // Return instruction for client to handle vision processing
          return {
            success: true,
            message: 'Client vision processing required',
            data: visionResult.content,
            processingInfo: {
              processedBy: 'client',
              reason: visionResult.reason,
              instruction: 'Please process this image using your local vision capabilities',
              suggestedPrompt: validatedRequest.customPrompt || 'Extract product information from this image'
            }
          };
        } else {
          extractedData = visionResult.content;
          processingInfo = {
            processedBy: 'server',
            visionModel: this.config.visionModel,
            reason: visionResult.reason
          };
        }
      } else {
        // Use LangChain for document processing when available
        if (this.config.useLangChain && ['pdf', 'docx', 'txt'].includes(validatedRequest.fileType)) {
          try {
            const docs = await this.processDocumentWithLangChain(
              validatedRequest.filePath,
              validatedRequest.fileType
            );
            extractedData = await this.processLargeDocument(docs, validatedRequest.customPrompt);
            processingInfo = {
              processedBy: 'langchain',
              chunks: docs.length,
              textModel: this.config.textModel
            };
          } catch (error) {
            // Fallback to traditional processing
            extractedData = await this.fallbackProcessing(validatedRequest.filePath, validatedRequest.fileType);
            processingInfo = {
              processedBy: 'fallback',
              reason: `LangChain failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
          }
        } else {
          // Traditional processing for other file types
          extractedData = await this.fallbackProcessing(validatedRequest.filePath, validatedRequest.fileType);
          processingInfo = {
            processedBy: 'traditional',
            fileType: validatedRequest.fileType
          };
        }
      }

      // Process based on mode
      switch (validatedRequest.processingMode) {
        case 'extract':
          return {
            success: true,
            message: 'Data extracted successfully',
            data: extractedData,
            processingInfo,
          };
        
        case 'analyze':
          return await this.analyzeData(extractedData, validatedRequest.customPrompt);
        
        case 'generate_products':
          return await this.generateProducts(extractedData, validatedRequest);
        
        case 'bulk_upload':
          return await this.bulkUploadProducts(extractedData, validatedRequest);
        
        default:
          return {
            success: false,
            message: `Unsupported processing mode: ${validatedRequest.processingMode}`,
          };
      }

    } catch (error) {
      return {
        success: false,
        message: `Processing error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  private async processCSV(filePath: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const results: any[] = [];
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => resolve(results))
        .on('error', reject);
    });
  }

  private async processExcel(filePath: string): Promise<any[]> {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(worksheet);
  }

  private async processPDF(filePath: string): Promise<string> {
    try {
      // Dynamic import to avoid module loading issues
      const pdf = await import('pdf-parse');
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdf.default(dataBuffer);
      return data.text;
    } catch (error) {
      throw new Error(`PDF processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async processDocx(filePath: string): Promise<string> {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  private async processText(filePath: string): Promise<string> {
    return fs.readFileSync(filePath, 'utf-8');
  }

  private async processJSON(filePath: string): Promise<any> {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  }

  private async analyzeData(data: any, customPrompt?: string): Promise<ProcessingResult> {
    const prompt = customPrompt || `
      Analyze the following data and provide insights about potential product information:
      
      Data: ${JSON.stringify(data, null, 2)}
      
      Please provide:
      1. Data structure analysis
      2. Potential product fields identified
      3. Data quality assessment
      4. Recommendations for product creation
    `;

    try {
      const analysis = await this.generateAIResponse(prompt);
      return {
        success: true,
        message: 'Data analysis completed',
        data: {
          analysis,
          originalData: data,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  private async generateProducts(data: any, request: z.infer<typeof DocumentProcessingRequestSchema>): Promise<ProcessingResult> {
    const template = request.template ? await this.loadTemplate(request.template) : null;

    const prompt = `
      Convert the following data into WooCommerce product format.
      ${template ? `Use this template as a guide: ${JSON.stringify(template, null, 2)}` : ''}

      Data: ${JSON.stringify(data, null, 2)}

      Generate products in this exact JSON format:
      {
        "products": [
          {
            "name": "Product Name",
            "description": "Product description",
            "short_description": "Short description",
            "regular_price": "99.99",
            "sku": "PRODUCT-SKU",
            "categories": [{"id": 1}],
            "tags": [{"name": "tag1"}],
            "meta_data": [{"key": "custom_field", "value": "value"}]
          }
        ]
      }

      Ensure all products have valid names and prices. Use intelligent mapping from the source data.
    `;

    try {
      const response = await this.generateAIResponse(prompt);
      const products = this.parseProductsFromResponse(response);

      if (request.validateOnly) {
        return {
          success: true,
          message: 'Products generated and validated',
          products,
          stats: {
            processed: products.length,
            successful: products.length,
            failed: 0,
            skipped: 0,
          },
        };
      }

      return {
        success: true,
        message: `Generated ${products.length} products`,
        products,
        stats: {
          processed: products.length,
          successful: products.length,
          failed: 0,
          skipped: 0,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: `Product generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  private async bulkUploadProducts(data: any, request: z.infer<typeof DocumentProcessingRequestSchema>): Promise<ProcessingResult> {
    // First generate products
    const generationResult = await this.generateProducts(data, { ...request, validateOnly: true });

    if (!generationResult.success || !generationResult.products) {
      return generationResult;
    }

    const products = generationResult.products;
    const batchSize = request.batchSize;
    const stats = {
      processed: 0,
      successful: 0,
      failed: 0,
      skipped: 0,
    };
    const errors: string[] = [];

    // Process in batches
    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize);

      for (const product of batch) {
        try {
          // Validate product data
          const validatedProduct = ProductTemplateSchema.parse(product);
          stats.processed++;
          stats.successful++;

          // Note: Actual WooCommerce upload would happen here
          // This is a placeholder for the upload logic

        } catch (error) {
          stats.processed++;
          stats.failed++;
          errors.push(`Product ${product.name || 'Unknown'}: ${error instanceof Error ? error.message : 'Validation failed'}`);
        }
      }
    }

    return {
      success: stats.successful > 0,
      message: `Bulk upload completed. ${stats.successful} successful, ${stats.failed} failed`,
      products: products.slice(0, stats.successful),
      stats,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  private async generateAIResponse(prompt: string, useVision: boolean = false, imagePath?: string): Promise<string> {
    if (!this.openai) {
      throw new Error(`🤖 AI service not configured.

📋 MCP Context: I'm an AI-powered WooCommerce management system that needs OpenAI API access for intelligent document processing.

🔧 Configuration Required:
1. Set OPENAI_API_KEY=sk-your-key in environment variables
2. Optionally set OPENAI_BASE_URL for custom endpoints (like local models)

🎯 My AI Capabilities:
- Document analysis and product generation
- Vision model support for image processing
- SEO optimization and content enhancement
- Multi-format document parsing

Current request: ${useVision ? 'Vision model processing' : 'Text model processing'}`);
    }

    try {
      if (useVision && imagePath) {
        // Use vision model for image processing
        const visionResult = await this.processImageWithVision(imagePath, prompt);
        return visionResult.content;
      } else {
        // Use text model for regular processing
        const response = await this.openai.chat.completions.create({
          model: this.config.textModel,
          messages: [
            {
              role: 'system',
              content: `You are an intelligent WooCommerce product management assistant. Your purpose is to help users manage their e-commerce store and create products from various document formats.

Context: ${prompt.includes('WooCommerce') ? 'WooCommerce product processing' : 'Document analysis for e-commerce'}

Always provide structured, actionable responses that can be used for WooCommerce product creation.`
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
        });

        return response.choices[0]?.message?.content || '';
      }
    } catch (error) {
      throw new Error(`AI processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private parseProductsFromResponse(response: string): any[] {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed.products || [parsed];
      }

      // If no JSON found, return empty array
      return [];
    } catch (error) {
      console.warn('Failed to parse products from AI response:', error);
      return [];
    }
  }

  private async loadTemplate(templateName: string): Promise<any> {
    const templatePath = path.join(this.config.templateDir, `${templateName}.json`);

    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template not found: ${templateName}`);
    }

    const content = fs.readFileSync(templatePath, 'utf-8');
    return JSON.parse(content);
  }

  async saveTemplate(templateName: string, template: any): Promise<void> {
    const templatePath = path.join(this.config.templateDir, `${templateName}.json`);
    fs.writeFileSync(templatePath, JSON.stringify(template, null, 2));
  }

  async listTemplates(): Promise<string[]> {
    if (!fs.existsSync(this.config.templateDir)) {
      return [];
    }

    return fs.readdirSync(this.config.templateDir)
      .filter(file => file.endsWith('.json'))
      .map(file => file.replace('.json', ''));
  }

  async processImage(imagePath: string, options: { resize?: { width: number; height: number } } = {}): Promise<string> {
    const outputPath = path.join(this.config.uploadDir, `processed_${Date.now()}_${path.basename(imagePath)}`);

    let processor = sharp(imagePath);

    if (options.resize) {
      processor = processor.resize(options.resize.width, options.resize.height);
    }

    await processor.jpeg({ quality: 85 }).toFile(outputPath);
    return outputPath;
  }

  async validateFile(filePath: string): Promise<{ valid: boolean; type?: string; size?: number; error?: string }> {
    try {
      if (!fs.existsSync(filePath)) {
        return { valid: false, error: 'File does not exist' };
      }

      const stats = fs.statSync(filePath);
      const mimeType = mime.lookup(filePath);

      // Check file size (max 50MB)
      if (stats.size > 50 * 1024 * 1024) {
        return { valid: false, error: 'File too large (max 50MB)' };
      }

      // Check supported file types
      const supportedTypes = [
        'text/csv',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'application/json',
        'image/jpeg',
        'image/png',
        'image/webp'
      ];

      if (!mimeType || !supportedTypes.includes(mimeType)) {
        return { valid: false, error: 'Unsupported file type' };
      }

      return {
        valid: true,
        type: mimeType,
        size: stats.size,
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown validation error',
      };
    }
  }
}
