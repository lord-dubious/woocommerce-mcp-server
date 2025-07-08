#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { z } from 'zod';

// Template schemas
export const FieldMappingSchema = z.object({
  sourceField: z.string(),
  targetField: z.string(),
  transform: z.enum(['none', 'uppercase', 'lowercase', 'capitalize', 'number', 'boolean', 'array', 'price']).default('none'),
  defaultValue: z.any().optional(),
  required: z.boolean().default(false),
  validation: z.object({
    type: z.enum(['string', 'number', 'boolean', 'email', 'url', 'regex']).optional(),
    pattern: z.string().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
  }).optional(),
});

export const ProductTemplateConfigSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  version: z.string().default('1.0.0'),
  author: z.string().optional(),
  created: z.string().default(() => new Date().toISOString()),
  updated: z.string().default(() => new Date().toISOString()),
  
  // Field mappings
  fieldMappings: z.array(FieldMappingSchema),
  
  // Default values for all products
  defaults: z.object({
    type: z.string().default('simple'),
    status: z.string().default('publish'),
    catalog_visibility: z.string().default('visible'),
    manage_stock: z.boolean().default(false),
    stock_status: z.string().default('instock'),
    backorders: z.string().default('no'),
    sold_individually: z.boolean().default(false),
    weight: z.string().optional(),
    dimensions: z.object({
      length: z.string().optional(),
      width: z.string().optional(),
      height: z.string().optional(),
    }).optional(),
    shipping_class: z.string().optional(),
    reviews_allowed: z.boolean().default(true),
    purchase_note: z.string().optional(),
    menu_order: z.number().default(0),
  }).optional(),
  
  // Category and tag mappings
  categoryMappings: z.array(z.object({
    sourceValue: z.string(),
    categoryId: z.number(),
    categoryName: z.string(),
  })).optional(),
  
  tagMappings: z.array(z.object({
    sourceField: z.string(),
    separator: z.string().default(','),
    transform: z.enum(['none', 'lowercase', 'uppercase', 'capitalize']).default('none'),
  })).optional(),
  
  // Image processing rules
  imageProcessing: z.object({
    sourceField: z.string().optional(),
    resize: z.object({
      width: z.number(),
      height: z.number(),
    }).optional(),
    quality: z.number().min(1).max(100).default(85),
    format: z.enum(['jpeg', 'png', 'webp']).default('jpeg'),
  }).optional(),
  
  // Validation rules
  validation: z.object({
    requiredFields: z.array(z.string()).default(['name']),
    uniqueFields: z.array(z.string()).default(['sku']),
    priceValidation: z.object({
      minPrice: z.number().default(0),
      maxPrice: z.number().optional(),
      currency: z.string().default('USD'),
    }).optional(),
  }).optional(),
  
  // AI processing instructions
  aiInstructions: z.object({
    descriptionGeneration: z.object({
      enabled: z.boolean().default(false),
      prompt: z.string().optional(),
      maxLength: z.number().default(500),
      includeFeatures: z.boolean().default(true),
      includeBenefits: z.boolean().default(true),
      tone: z.enum(['professional', 'casual', 'enthusiastic', 'technical']).default('professional'),
    }).optional(),
    
    seoOptimization: z.object({
      enabled: z.boolean().default(false),
      generateMetaTitle: z.boolean().default(true),
      generateMetaDescription: z.boolean().default(true),
      generateKeywords: z.boolean().default(true),
      targetKeywords: z.array(z.string()).optional(),
    }).optional(),
    
    categoryPrediction: z.object({
      enabled: z.boolean().default(false),
      confidence: z.number().min(0).max(1).default(0.8),
      maxCategories: z.number().default(3),
    }).optional(),
  }).optional(),
});

export class TemplateManager {
  private templateDir: string;

  constructor(templateDir: string = './templates') {
    this.templateDir = templateDir;
    this.ensureTemplateDirectory();
    this.createDefaultTemplates();
  }

  private ensureTemplateDirectory(): void {
    if (!fs.existsSync(this.templateDir)) {
      fs.mkdirSync(this.templateDir, { recursive: true });
    }
  }

  private createDefaultTemplates(): void {
    const defaultTemplates = [
      this.createBasicProductTemplate(),
      this.createEcommerceCSVTemplate(),
      this.createInventoryTemplate(),
      this.createDigitalProductTemplate(),
    ];

    defaultTemplates.forEach(template => {
      const templatePath = path.join(this.templateDir, `${template.name}.json`);
      if (!fs.existsSync(templatePath)) {
        this.saveTemplate(template.name, template);
      }
    });
  }

  private createBasicProductTemplate(): z.infer<typeof ProductTemplateConfigSchema> {
    return {
      name: 'basic-product',
      description: 'Basic product template for simple CSV imports',
      version: '1.0.0',
      author: 'WooCommerce MCP Server',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      
      fieldMappings: [
        { sourceField: 'name', targetField: 'name', transform: 'none', required: true },
        { sourceField: 'description', targetField: 'description', transform: 'none', required: false },
        { sourceField: 'short_description', targetField: 'short_description', transform: 'none', required: false },
        { sourceField: 'price', targetField: 'regular_price', transform: 'price', required: true },
        { sourceField: 'sale_price', targetField: 'sale_price', transform: 'price', required: false },
        { sourceField: 'sku', targetField: 'sku', transform: 'none', required: false },
        { sourceField: 'stock', targetField: 'stock_quantity', transform: 'number', required: false },
        { sourceField: 'weight', targetField: 'weight', transform: 'none', required: false },
      ],
      
      defaults: {
        type: 'simple',
        status: 'publish',
        catalog_visibility: 'visible',
        manage_stock: true,
        stock_status: 'instock',
        backorders: 'no',
        sold_individually: false,
        reviews_allowed: true,
        menu_order: 0,
      },
      
      validation: {
        requiredFields: ['name', 'regular_price'],
        uniqueFields: ['sku'],
        priceValidation: {
          minPrice: 0.01,
          currency: 'USD',
        },
      },
    };
  }

  private createEcommerceCSVTemplate(): z.infer<typeof ProductTemplateConfigSchema> {
    return {
      name: 'ecommerce-csv',
      description: 'Template for standard e-commerce CSV exports',
      version: '1.0.0',
      author: 'WooCommerce MCP Server',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      
      fieldMappings: [
        { sourceField: 'Product Name', targetField: 'name', transform: 'none', required: true },
        { sourceField: 'Product Description', targetField: 'description', transform: 'none', required: false },
        { sourceField: 'Short Description', targetField: 'short_description', transform: 'none', required: false },
        { sourceField: 'Regular Price', targetField: 'regular_price', transform: 'price', required: true },
        { sourceField: 'Sale Price', targetField: 'sale_price', transform: 'price', required: false },
        { sourceField: 'SKU', targetField: 'sku', transform: 'none', required: false },
        { sourceField: 'Stock Quantity', targetField: 'stock_quantity', transform: 'number', required: false },
        { sourceField: 'Category', targetField: 'categories', transform: 'array', required: false },
        { sourceField: 'Tags', targetField: 'tags', transform: 'array', required: false },
        { sourceField: 'Image URL', targetField: 'images', transform: 'array', required: false },
        { sourceField: 'Weight', targetField: 'weight', transform: 'none', required: false },
        { sourceField: 'Length', targetField: 'dimensions.length', transform: 'none', required: false },
        { sourceField: 'Width', targetField: 'dimensions.width', transform: 'none', required: false },
        { sourceField: 'Height', targetField: 'dimensions.height', transform: 'none', required: false },
      ],
      
      categoryMappings: [
        { sourceValue: 'Electronics', categoryId: 1, categoryName: 'Electronics' },
        { sourceValue: 'Clothing', categoryId: 2, categoryName: 'Clothing' },
        { sourceValue: 'Books', categoryId: 3, categoryName: 'Books' },
        { sourceValue: 'Home & Garden', categoryId: 4, categoryName: 'Home & Garden' },
      ],
      
      tagMappings: [
        { sourceField: 'Tags', separator: ',', transform: 'lowercase' },
      ],
      
      imageProcessing: {
        sourceField: 'Image URL',
        resize: { width: 800, height: 800 },
        quality: 85,
        format: 'jpeg',
      },
      
      validation: {
        requiredFields: ['name', 'regular_price'],
        uniqueFields: ['sku'],
        priceValidation: {
          minPrice: 0.01,
          maxPrice: 10000,
          currency: 'USD',
        },
      },
      
      aiInstructions: {
        descriptionGeneration: {
          enabled: true,
          prompt: 'Generate a compelling product description based on the product name and features',
          maxLength: 500,
          includeFeatures: true,
          includeBenefits: true,
          tone: 'professional',
        },
        
        seoOptimization: {
          enabled: true,
          generateMetaTitle: true,
          generateMetaDescription: true,
          generateKeywords: true,
        },
        
        categoryPrediction: {
          enabled: true,
          confidence: 0.8,
          maxCategories: 2,
        },
      },
    };
  }

  private createInventoryTemplate(): z.infer<typeof ProductTemplateConfigSchema> {
    return {
      name: 'inventory-management',
      description: 'Template for inventory management systems',
      version: '1.0.0',
      author: 'WooCommerce MCP Server',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      
      fieldMappings: [
        { sourceField: 'item_name', targetField: 'name', transform: 'none', required: true },
        { sourceField: 'item_code', targetField: 'sku', transform: 'none', required: true },
        { sourceField: 'unit_price', targetField: 'regular_price', transform: 'price', required: true },
        { sourceField: 'quantity_on_hand', targetField: 'stock_quantity', transform: 'number', required: false },
        { sourceField: 'item_description', targetField: 'description', transform: 'none', required: false },
        { sourceField: 'category_code', targetField: 'categories', transform: 'none', required: false },
        { sourceField: 'supplier_name', targetField: 'meta_data', transform: 'none', required: false, defaultValue: 'supplier' },
        { sourceField: 'reorder_level', targetField: 'meta_data', transform: 'none', required: false, defaultValue: 'reorder_level' },
        { sourceField: 'unit_weight', targetField: 'weight', transform: 'none', required: false },
      ],
      
      defaults: {
        type: 'simple',
        status: 'publish',
        catalog_visibility: 'visible',
        manage_stock: true,
        stock_status: 'instock',
        backorders: 'notify',
        sold_individually: false,
        reviews_allowed: true,
        menu_order: 0,
      },
      
      validation: {
        requiredFields: ['name', 'sku', 'regular_price'],
        uniqueFields: ['sku'],
        priceValidation: {
          minPrice: 0,
          currency: 'USD',
        },
      },
    };
  }

  private createDigitalProductTemplate(): z.infer<typeof ProductTemplateConfigSchema> {
    return {
      name: 'digital-product',
      description: 'Template for digital products and downloads',
      version: '1.0.0',
      author: 'WooCommerce MCP Server',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      
      fieldMappings: [
        { sourceField: 'title', targetField: 'name', transform: 'none', required: true },
        { sourceField: 'description', targetField: 'description', transform: 'none', required: false },
        { sourceField: 'price', targetField: 'regular_price', transform: 'price', required: true },
        { sourceField: 'download_url', targetField: 'downloads', transform: 'none', required: false },
        { sourceField: 'file_size', targetField: 'meta_data', transform: 'none', required: false, defaultValue: 'file_size' },
        { sourceField: 'format', targetField: 'meta_data', transform: 'none', required: false, defaultValue: 'file_format' },
        { sourceField: 'license', targetField: 'meta_data', transform: 'none', required: false, defaultValue: 'license_type' },
      ],
      
      defaults: {
        type: 'simple',
        status: 'publish',
        catalog_visibility: 'visible',
        manage_stock: false,
        stock_status: 'instock',
        backorders: 'no',
        sold_individually: true,
        reviews_allowed: true,
        menu_order: 0,
      },
      
      validation: {
        requiredFields: ['name', 'regular_price'],
        uniqueFields: [],
        priceValidation: {
          minPrice: 0.99,
          currency: 'USD',
        },
      },
      
      aiInstructions: {
        descriptionGeneration: {
          enabled: true,
          prompt: 'Generate a description for this digital product highlighting its features and benefits',
          maxLength: 300,
          includeFeatures: true,
          includeBenefits: true,
          tone: 'professional',
        },
      },
    };
  }

  async saveTemplate(name: string, template: z.infer<typeof ProductTemplateConfigSchema>): Promise<void> {
    const validatedTemplate = ProductTemplateConfigSchema.parse({
      ...template,
      updated: new Date().toISOString(),
    });
    
    const templatePath = path.join(this.templateDir, `${name}.json`);
    fs.writeFileSync(templatePath, JSON.stringify(validatedTemplate, null, 2));
  }

  async loadTemplate(name: string): Promise<z.infer<typeof ProductTemplateConfigSchema>> {
    const templatePath = path.join(this.templateDir, `${name}.json`);
    
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template not found: ${name}`);
    }

    const content = fs.readFileSync(templatePath, 'utf-8');
    const template = JSON.parse(content);
    
    return ProductTemplateConfigSchema.parse(template);
  }

  async listTemplates(): Promise<Array<{ name: string; description?: string; version?: string }>> {
    if (!fs.existsSync(this.templateDir)) {
      return [];
    }

    const files = fs.readdirSync(this.templateDir).filter(file => file.endsWith('.json'));
    const templates = [];

    for (const file of files) {
      try {
        const template = await this.loadTemplate(file.replace('.json', ''));
        templates.push({
          name: template.name,
          description: template.description,
          version: template.version,
        });
      } catch (error) {
        console.warn(`Failed to load template ${file}:`, error);
      }
    }

    return templates;
  }

  async deleteTemplate(name: string): Promise<void> {
    const templatePath = path.join(this.templateDir, `${name}.json`);
    
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template not found: ${name}`);
    }

    fs.unlinkSync(templatePath);
  }

  async validateTemplate(template: any): Promise<{ valid: boolean; errors?: string[] }> {
    try {
      ProductTemplateConfigSchema.parse(template);
      return { valid: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          valid: false,
          errors: error.errors.map(err => `${err.path.join('.')}: ${err.message}`),
        };
      }
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : 'Unknown validation error'],
      };
    }
  }
}
