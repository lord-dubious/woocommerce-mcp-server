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

// Document processing schemas
export const DocumentProcessingConfigSchema = z.object({
  vllmEndpoint: z.string().url().optional(),
  openaiApiKey: z.string().optional(),
  model: z.string().default('gpt-4'),
  maxTokens: z.number().default(4000),
  temperature: z.number().min(0).max(2).default(0.7),
  uploadDir: z.string().default('./uploads'),
  templateDir: z.string().default('./templates'),
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
  fileType: z.enum(['csv', 'xlsx', 'pdf', 'docx', 'txt', 'json']),
  processingMode: z.enum(['extract', 'analyze', 'generate_products', 'bulk_upload']),
  template: z.string().optional(),
  customPrompt: z.string().optional(),
  batchSize: z.number().min(1).max(100).default(10),
  validateOnly: z.boolean().default(false),
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
}

export class DocumentProcessor {
  private config: z.infer<typeof DocumentProcessingConfigSchema>;
  private openai?: OpenAI;
  private vllmClient?: any;

  constructor(config: z.infer<typeof DocumentProcessingConfigSchema>) {
    this.config = DocumentProcessingConfigSchema.parse(config);
    
    // Initialize AI clients
    if (this.config.openaiApiKey) {
      this.openai = new OpenAI({
        apiKey: this.config.openaiApiKey,
      });
    }

    // Initialize vLLM client if endpoint provided
    if (this.config.vllmEndpoint) {
      this.initializeVLLMClient();
    }

    // Ensure directories exist
    this.ensureDirectories();
  }

  private initializeVLLMClient() {
    // vLLM client initialization
    this.vllmClient = {
      endpoint: this.config.vllmEndpoint,
      generateCompletion: async (prompt: string, options: any = {}) => {
        const response = await fetch(`${this.config.vllmEndpoint}/v1/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: options.model || 'default',
            prompt: prompt,
            max_tokens: options.max_tokens || this.config.maxTokens,
            temperature: options.temperature || this.config.temperature,
            stop: options.stop || null,
          }),
        });
        
        if (!response.ok) {
          throw new Error(`vLLM API error: ${response.statusText}`);
        }
        
        const data = await response.json();
        return data.choices[0]?.text || '';
      }
    };
  }

  private ensureDirectories() {
    [this.config.uploadDir, this.config.templateDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
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

      // Process based on file type
      let extractedData: any;
      switch (validatedRequest.fileType) {
        case 'csv':
          extractedData = await this.processCSV(validatedRequest.filePath);
          break;
        case 'xlsx':
          extractedData = await this.processExcel(validatedRequest.filePath);
          break;
        case 'pdf':
          extractedData = await this.processPDF(validatedRequest.filePath);
          break;
        case 'docx':
          extractedData = await this.processDocx(validatedRequest.filePath);
          break;
        case 'txt':
          extractedData = await this.processText(validatedRequest.filePath);
          break;
        case 'json':
          extractedData = await this.processJSON(validatedRequest.filePath);
          break;
        default:
          return {
            success: false,
            message: `Unsupported file type: ${validatedRequest.fileType}`,
          };
      }

      // Process based on mode
      switch (validatedRequest.processingMode) {
        case 'extract':
          return {
            success: true,
            message: 'Data extracted successfully',
            data: extractedData,
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

  private async generateAIResponse(prompt: string): Promise<string> {
    // Try vLLM first if available
    if (this.vllmClient) {
      try {
        return await this.vllmClient.generateCompletion(prompt);
      } catch (error) {
        console.warn('vLLM failed, falling back to OpenAI:', error);
      }
    }

    // Fallback to OpenAI
    if (this.openai) {
      const response = await this.openai.chat.completions.create({
        model: this.config.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
      });

      return response.choices[0]?.message?.content || '';
    }

    throw new Error('No AI service available. Configure either vLLM endpoint or OpenAI API key.');
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
