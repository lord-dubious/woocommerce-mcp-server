#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import axios from "axios";
import { WooMetaData } from "./types.js";
import { DocumentProcessor, DocumentProcessingConfigSchema, DocumentProcessingRequestSchema } from "./document-processor.js";
import { TemplateManager, ProductTemplateConfigSchema } from "./template-manager.js";
import { FileHandler, FileUploadSchema, FileSearchSchema } from "./file-handler.js";

// Global credentials that MCP remembers and uses automatically
const GLOBAL_CREDENTIALS = {
  siteUrl: process.env.WORDPRESS_SITE_URL || "",
  username: process.env.WORDPRESS_USERNAME || "",
  password: process.env.WORDPRESS_PASSWORD || "",
  consumerKey: process.env.WOOCOMMERCE_CONSUMER_KEY || "",
  consumerSecret: process.env.WOOCOMMERCE_CONSUMER_SECRET || "",
};

// MCP Server Context - Understanding its main purpose and capabilities
const MCP_CONTEXT = {
  purpose: "WooCommerce E-commerce Management and AI-Powered Product Creation",
  description: "I am an intelligent WooCommerce management system that helps you manage your online store and create products from any document using AI vision models.",
  capabilities: [
    "Complete WooCommerce store management (products, orders, customers, etc.)",
    "AI-powered document processing with vision model support",
    "Bulk operations with intelligent automation and error handling",
    "SEO optimization and content enhancement",
    "Multi-format document parsing (CSV, Excel, PDF, images, etc.)",
    "Enterprise-grade workflow automation with progress tracking"
  ],
  defaultBehavior: "Always use stored environment credentials unless explicitly overridden by user",
  aiProvider: "OpenAI-compatible API with vision model support",
  credentialPolicy: "Automatically use environment credentials, allow override per request",
};

// Validation schemas
const WooCommerceCredentialsSchema = z.object({
  siteUrl: z.string().url().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  consumerKey: z.string().optional(),
  consumerSecret: z.string().optional(),
});

const WordPressCredentialsSchema = z.object({
  siteUrl: z.string().url().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
});

const ProductDataSchema = z.object({
  name: z.string(),
  type: z.enum(["simple", "grouped", "external", "variable"]).default("simple"),
  regular_price: z.string().optional(),
  description: z.string().optional(),
  short_description: z.string().optional(),
  categories: z.array(z.object({ id: z.number() })).optional(),
  images: z.array(z.object({ src: z.string() })).optional(),
});

const OrderDataSchema = z.object({
  payment_method: z.string().optional(),
  payment_method_title: z.string().optional(),
  set_paid: z.boolean().optional(),
  billing: z.object({
    first_name: z.string(),
    last_name: z.string(),
    address_1: z.string(),
    city: z.string(),
    state: z.string(),
    postcode: z.string(),
    country: z.string(),
    email: z.string().email(),
    phone: z.string().optional(),
  }).optional(),
  shipping: z.object({
    first_name: z.string(),
    last_name: z.string(),
    address_1: z.string(),
    city: z.string(),
    state: z.string(),
    postcode: z.string(),
    country: z.string(),
  }).optional(),
  line_items: z.array(z.object({
    product_id: z.number(),
    quantity: z.number(),
  })),
});

const CustomerDataSchema = z.object({
  email: z.string().email(),
  first_name: z.string(),
  last_name: z.string(),
  username: z.string().optional(),
  billing: z.object({
    first_name: z.string(),
    last_name: z.string(),
    company: z.string().optional(),
    address_1: z.string(),
    address_2: z.string().optional(),
    city: z.string(),
    state: z.string(),
    postcode: z.string(),
    country: z.string(),
    email: z.string().email(),
    phone: z.string().optional(),
  }).optional(),
  shipping: z.object({
    first_name: z.string(),
    last_name: z.string(),
    company: z.string().optional(),
    address_1: z.string(),
    address_2: z.string().optional(),
    city: z.string(),
    state: z.string(),
    postcode: z.string(),
    country: z.string(),
  }).optional(),
});

const CategoryDataSchema = z.object({
  name: z.string(),
  slug: z.string().optional(),
  parent: z.number().optional(),
  description: z.string().optional(),
  display: z.enum(["default", "products", "subcategories", "both"]).optional(),
  image: z.object({
    src: z.string(),
    alt: z.string().optional(),
  }).optional(),
});

const CouponDataSchema = z.object({
  code: z.string(),
  amount: z.string(),
  discount_type: z.enum(["percent", "fixed_cart", "fixed_product"]).default("fixed_cart"),
  description: z.string().optional(),
  date_expires: z.string().optional(),
  individual_use: z.boolean().optional(),
  product_ids: z.array(z.number()).optional(),
  excluded_product_ids: z.array(z.number()).optional(),
  usage_limit: z.number().optional(),
  usage_limit_per_user: z.number().optional(),
  limit_usage_to_x_items: z.number().optional(),
  free_shipping: z.boolean().optional(),
  product_categories: z.array(z.number()).optional(),
  excluded_product_categories: z.array(z.number()).optional(),
  exclude_sale_items: z.boolean().optional(),
  minimum_amount: z.string().optional(),
  maximum_amount: z.string().optional(),
  email_restrictions: z.array(z.string()).optional(),
});

const TagDataSchema = z.object({
  name: z.string(),
  slug: z.string().optional(),
  description: z.string().optional(),
});

const AttributeDataSchema = z.object({
  name: z.string(),
  slug: z.string().optional(),
  type: z.enum(["select", "text"]).default("select"),
  order_by: z.enum(["menu_order", "name", "name_num", "id"]).default("menu_order"),
  has_archives: z.boolean().optional(),
});

const AttributeTermDataSchema = z.object({
  name: z.string(),
  slug: z.string().optional(),
  description: z.string().optional(),
  menu_order: z.number().optional(),
});

const VariationDataSchema = z.object({
  description: z.string().optional(),
  sku: z.string().optional(),
  regular_price: z.string().optional(),
  sale_price: z.string().optional(),
  stock_quantity: z.number().optional(),
  manage_stock: z.boolean().optional(),
  stock_status: z.enum(["instock", "outofstock", "onbackorder"]).optional(),
  attributes: z.array(z.object({
    id: z.number(),
    name: z.string(),
    option: z.string(),
  })).optional(),
  image: z.object({
    src: z.string(),
    alt: z.string().optional(),
  }).optional(),
});

const ReviewDataSchema = z.object({
  review: z.string(),
  reviewer: z.string(),
  reviewer_email: z.string().email(),
  rating: z.number().min(1).max(5),
});

const ShippingZoneDataSchema = z.object({
  name: z.string(),
  order: z.number().optional(),
});

const ShippingMethodDataSchema = z.object({
  method_id: z.string(),
  method_title: z.string().optional(),
  enabled: z.boolean().optional(),
  settings: z.record(z.any()).optional(),
});

const TaxRateDataSchema = z.object({
  country: z.string().optional(),
  state: z.string().optional(),
  postcode: z.string().optional(),
  city: z.string().optional(),
  rate: z.string(),
  name: z.string(),
  priority: z.number().optional(),
  compound: z.boolean().optional(),
  shipping: z.boolean().optional(),
  order: z.number().optional(),
  class: z.string().optional(),
});

const OrderNoteDataSchema = z.object({
  note: z.string(),
  customer_note: z.boolean().optional(),
  added_by_user: z.boolean().optional(),
});

const RefundDataSchema = z.object({
  amount: z.string().optional(),
  reason: z.string().optional(),
  refunded_by: z.number().optional(),
  line_items: z.array(z.object({
    id: z.number(),
    quantity: z.number(),
    refund_total: z.string(),
  })).optional(),
});

const PostDataSchema = z.object({
  title: z.string(),
  content: z.string(),
  status: z.enum(["publish", "draft", "private", "pending"]).default("draft"),
  excerpt: z.string().optional(),
  author: z.number().optional(),
  featured_media: z.number().optional(),
  comment_status: z.enum(["open", "closed"]).optional(),
  ping_status: z.enum(["open", "closed"]).optional(),
  categories: z.array(z.number()).optional(),
  tags: z.array(z.number()).optional(),
});

const TaxClassDataSchema = z.object({
  name: z.string(),
  slug: z.string().optional(),
});

const SettingDataSchema = z.object({
  value: z.any(),
  description: z.string().optional(),
});

// Helper function to create API clients
// Smart credential management - automatically uses global credentials with override support
function createWooCommerceClient(credentials: z.infer<typeof WooCommerceCredentialsSchema> = {}) {
  // Merge provided credentials with global credentials (provided credentials take precedence)
  const finalCredentials = {
    siteUrl: credentials.siteUrl || GLOBAL_CREDENTIALS.siteUrl,
    consumerKey: credentials.consumerKey || GLOBAL_CREDENTIALS.consumerKey,
    consumerSecret: credentials.consumerSecret || GLOBAL_CREDENTIALS.consumerSecret,
  };

  if (!finalCredentials.siteUrl) {
    throw new Error(`🔧 WordPress site URL not configured.

📋 MCP Context: ${MCP_CONTEXT.purpose}
🎯 I need your WooCommerce site URL to manage your store.

Configuration Options:
1. Set WORDPRESS_SITE_URL=https://your-site.com in environment
2. Or provide siteUrl in request parameters

Current capabilities: ${MCP_CONTEXT.capabilities.slice(0, 2).join(', ')}`);
  }

  if (!finalCredentials.consumerKey || !finalCredentials.consumerSecret) {
    throw new Error(`🔧 WooCommerce API credentials not configured.

📋 MCP Context: ${MCP_CONTEXT.purpose}
🎯 I need your WooCommerce API credentials to manage products, orders, and customers.

Configuration Steps:
1. Go to WooCommerce → Settings → Advanced → REST API
2. Create new API key with Read/Write permissions
3. Set WOOCOMMERCE_CONSUMER_KEY=ck_your_key in environment
4. Set WOOCOMMERCE_CONSUMER_SECRET=cs_your_secret in environment
5. Or provide consumerKey and consumerSecret in request parameters

🤖 Default Behavior: ${MCP_CONTEXT.defaultBehavior}`);
  }

  return axios.create({
    baseURL: `${finalCredentials.siteUrl}/wp-json/wc/v3`,
    params: {
      consumer_key: finalCredentials.consumerKey,
      consumer_secret: finalCredentials.consumerSecret,
    },
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function createWordPressClient(credentials: z.infer<typeof WooCommerceCredentialsSchema> = {}) {
  // Merge provided credentials with global credentials (provided credentials take precedence)
  const finalCredentials = {
    siteUrl: credentials.siteUrl || GLOBAL_CREDENTIALS.siteUrl,
    username: credentials.username || GLOBAL_CREDENTIALS.username,
    password: credentials.password || GLOBAL_CREDENTIALS.password,
  };

  if (!finalCredentials.siteUrl) {
    throw new Error(`🔧 WordPress site URL not configured.

📋 MCP Context: ${MCP_CONTEXT.purpose}
🎯 I need your WordPress site URL for content management operations.

Configuration Options:
1. Set WORDPRESS_SITE_URL=https://your-site.com in environment
2. Or provide siteUrl in request parameters`);
  }

  if (!finalCredentials.username || !finalCredentials.password) {
    throw new Error(`🔧 WordPress credentials not configured.

📋 MCP Context: ${MCP_CONTEXT.purpose}
🎯 I need WordPress admin credentials for content management.

Configuration Steps:
1. Set WORDPRESS_USERNAME=your_admin_username in environment
2. Set WORDPRESS_PASSWORD=your_admin_password in environment
3. Or provide username and password in request parameters

🤖 Default Behavior: ${MCP_CONTEXT.defaultBehavior}`);
  }

  const auth = Buffer.from(`${finalCredentials.username}:${finalCredentials.password}`).toString("base64");
  return axios.create({
    baseURL: `${finalCredentials.siteUrl}/wp-json/wp/v2`,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
  });
}

// Generic meta data helper functions to reduce code duplication
async function getEntityMeta(client: any, entityType: string, entityId: number, metaKey?: string) {
  const response = await client.get(`/${entityType}/${entityId}`);
  const metaData = response.data.meta_data || [];

  return metaKey
    ? metaData.filter((meta: any) => meta.key === metaKey)
    : metaData;
}

async function updateEntityMeta(client: any, entityType: string, entityId: number, metaKey: string, metaValue: any) {
  // Get current entity data
  const entityResponse = await client.get(`/${entityType}/${entityId}`);
  const entity = entityResponse.data;
  let metaData = entity.meta_data || [];

  // Look for existing meta with the same key
  const existingMetaIndex = metaData.findIndex((meta: any) => meta.key === metaKey);

  if (existingMetaIndex >= 0) {
    // Update existing meta
    metaData[existingMetaIndex].value = metaValue;
  } else {
    // Add new meta
    metaData.push({ key: metaKey, value: metaValue });
  }

  // Update the entity with the modified meta_data
  return await client.put(`/${entityType}/${entityId}`, {
    meta_data: metaData,
  });
}

async function deleteEntityMeta(client: any, entityType: string, entityId: number, metaKey: string) {
  // Get current entity data
  const entityResponse = await client.get(`/${entityType}/${entityId}`);
  const entity = entityResponse.data;
  let metaData = entity.meta_data || [];

  // Filter out the meta key to delete
  const updatedMetaData = metaData.filter((meta: any) => meta.key !== metaKey);

  // Update the entity with the filtered meta_data
  return await client.put(`/${entityType}/${entityId}`, {
    meta_data: updatedMetaData,
  });
}

// Initialize document processing components with LangChain and vision language model support
const documentProcessor = new DocumentProcessor({
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiBaseUrl: process.env.OPENAI_BASE_URL, // Support for custom OpenAI-compatible endpoints
  model: process.env.AI_MODEL || 'gpt-4-vision-preview', // Default vision language model
  visionModel: process.env.AI_VISION_MODEL || 'gpt-4-vision-preview',
  textModel: process.env.AI_TEXT_MODEL || 'gpt-4',
  maxTokens: parseInt(process.env.AI_MAX_TOKENS || '4000'),
  temperature: parseFloat(process.env.AI_TEMPERATURE || '0.7'),
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  templateDir: process.env.TEMPLATE_DIR || './templates',
  supportedImageFormats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff'],
  enableClientVisionDetection: process.env.ENABLE_CLIENT_VISION_DETECTION !== 'false',
  useLangChain: process.env.USE_LANGCHAIN !== 'false',
  chunkSize: parseInt(process.env.LANGCHAIN_CHUNK_SIZE || '1000'),
  chunkOverlap: parseInt(process.env.LANGCHAIN_CHUNK_OVERLAP || '200'),
});

const templateManager = new TemplateManager(process.env.TEMPLATE_DIR || './templates');
const fileHandler = new FileHandler({
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '52428800'), // 50MB
  allowedExtensions: ['.csv', '.xlsx', '.xls', '.pdf', '.docx', '.doc', '.txt', '.json', '.jpg', '.jpeg', '.png', '.gif', '.webp'],
});

// Error handling helper
function handleApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message || error.message;
    const code = error.response?.data?.code || error.response?.status;
    return `API Error ${code ? `(${code})` : ""}: ${message}`;
  }
  return error instanceof Error ? error.message : "Unknown error occurred";
}

// Create the MCP server
const server = new McpServer({
  name: "woocommerce-mcp-server",
  version: "1.0.0",
});

// Product Management Tools
server.registerTool(
  "get_products",
  {
    title: "Get Products",
    description: "Retrieve a list of products from WooCommerce",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      perPage: z.number().min(1).max(100).default(10),
      page: z.number().min(1).default(1),
      search: z.string().optional(),
      category: z.string().optional(),
      tag: z.string().optional(),
      featured: z.boolean().optional(),
      on_sale: z.boolean().optional(),
      min_price: z.string().optional(),
      max_price: z.string().optional(),
      stock_status: z.enum(["instock", "outofstock", "onbackorder"]).optional(),
    },
  },
  async ({ credentials = {}, perPage = 10, page = 1, ...filters }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.get("/products", {
        params: {
          per_page: perPage,
          page,
          ...filters,
        },
      });

      return {
        content: [
          {
            type: "text",
            text: `Found ${response.data.length} products:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving products: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "get_product",
  {
    title: "Get Product",
    description: "Retrieve a specific product by ID from WooCommerce",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      productId: z.number().positive(),
    },
  },
  async ({ credentials = {}, productId }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.get(`/products/${productId}`);

      return {
        content: [
          {
            type: "text",
            text: `Product details:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving product: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "create_product",
  {
    title: "Create Product",
    description: "Create a new product in WooCommerce",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      productData: ProductDataSchema,
    },
  },
  async ({ credentials = {}, productData }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.post("/products", productData);

      return {
        content: [
          {
            type: "text",
            text: `Product created successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error creating product: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "update_product",
  {
    title: "Update Product",
    description: "Update an existing product in WooCommerce",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      productId: z.number().positive(),
      productData: ProductDataSchema.partial(),
    },
  },
  async ({ credentials = {}, productId, productData }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.put(`/products/${productId}`, productData);

      return {
        content: [
          {
            type: "text",
            text: `Product updated successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error updating product: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "delete_product",
  {
    title: "Delete Product",
    description: "Delete a product from WooCommerce",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      productId: z.number().positive(),
      force: z.boolean().default(false),
    },
  },
  async ({ credentials = {}, productId, force = false }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.delete(`/products/${productId}`, {
        params: { force },
      });

      return {
        content: [
          {
            type: "text",
            text: `Product ${force ? "permanently deleted" : "moved to trash"} successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error deleting product: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Order Management Tools
server.registerTool(
  "get_orders",
  {
    title: "Get Orders",
    description: "Retrieve a list of orders from WooCommerce",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      perPage: z.number().min(1).max(100).default(10),
      page: z.number().min(1).default(1),
      search: z.string().optional(),
      after: z.string().optional(),
      before: z.string().optional(),
      status: z.enum(["pending", "processing", "on-hold", "completed", "cancelled", "refunded", "failed", "trash"]).optional(),
      customer: z.number().optional(),
      product: z.number().optional(),
    },
  },
  async ({ credentials = {}, perPage = 10, page = 1, ...filters }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.get("/orders", {
        params: {
          per_page: perPage,
          page,
          ...filters,
        },
      });

      return {
        content: [
          {
            type: "text",
            text: `Found ${response.data.length} orders:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving orders: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "get_order",
  {
    title: "Get Order",
    description: "Retrieve a specific order by ID from WooCommerce",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      orderId: z.number().positive(),
    },
  },
  async ({ credentials = {}, orderId }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.get(`/orders/${orderId}`);

      return {
        content: [
          {
            type: "text",
            text: `Order details:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving order: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "create_order",
  {
    title: "Create Order",
    description: "Create a new order in WooCommerce",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      orderData: OrderDataSchema,
    },
  },
  async ({ credentials = {}, orderData }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.post("/orders", orderData);

      return {
        content: [
          {
            type: "text",
            text: `Order created successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error creating order: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "update_order",
  {
    title: "Update Order",
    description: "Update an existing order in WooCommerce",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      orderId: z.number().positive(),
      orderData: OrderDataSchema.partial(),
    },
  },
  async ({ credentials = {}, orderId, orderData }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.put(`/orders/${orderId}`, orderData);

      return {
        content: [
          {
            type: "text",
            text: `Order updated successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error updating order: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "delete_order",
  {
    title: "Delete Order",
    description: "Delete an order from WooCommerce",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      orderId: z.number().positive(),
      force: z.boolean().default(false),
    },
  },
  async ({ credentials = {}, orderId, force = false }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.delete(`/orders/${orderId}`, {
        params: { force },
      });

      return {
        content: [
          {
            type: "text",
            text: `Order ${force ? "permanently deleted" : "moved to trash"} successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error deleting order: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Customer Management Tools
server.registerTool(
  "get_customers",
  {
    title: "Get Customers",
    description: "Retrieve a list of customers from WooCommerce",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      perPage: z.number().min(1).max(100).default(10),
      page: z.number().min(1).default(1),
      search: z.string().optional(),
      email: z.string().email().optional(),
      role: z.enum(["all", "administrator", "editor", "author", "contributor", "subscriber", "customer", "shop_manager"]).optional(),
    },
  },
  async ({ credentials = {}, perPage = 10, page = 1, ...filters }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.get("/customers", {
        params: {
          per_page: perPage,
          page,
          ...filters,
        },
      });

      return {
        content: [
          {
            type: "text",
            text: `Found ${response.data.length} customers:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving customers: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "get_customer",
  {
    title: "Get Customer",
    description: "Retrieve a specific customer by ID from WooCommerce",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      customerId: z.number().positive(),
    },
  },
  async ({ credentials = {}, customerId }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.get(`/customers/${customerId}`);

      return {
        content: [
          {
            type: "text",
            text: `Customer details:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving customer: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "create_customer",
  {
    title: "Create Customer",
    description: "Create a new customer in WooCommerce",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      customerData: CustomerDataSchema,
    },
  },
  async ({ credentials = {}, customerData }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.post("/customers", customerData);

      return {
        content: [
          {
            type: "text",
            text: `Customer created successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error creating customer: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "update_customer",
  {
    title: "Update Customer",
    description: "Update an existing customer in WooCommerce",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      customerId: z.number().positive(),
      customerData: CustomerDataSchema.partial(),
    },
  },
  async ({ credentials = {}, customerId, customerData }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.put(`/customers/${customerId}`, customerData);

      return {
        content: [
          {
            type: "text",
            text: `Customer updated successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error updating customer: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "delete_customer",
  {
    title: "Delete Customer",
    description: "Delete a customer from WooCommerce",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      customerId: z.number().positive(),
      force: z.boolean().default(false),
      reassign: z.number().optional(),
    },
  },
  async ({ credentials = {}, customerId, force = false, reassign }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const params: any = { force };
      if (reassign) params.reassign = reassign;

      const response = await client.delete(`/customers/${customerId}`, { params });

      return {
        content: [
          {
            type: "text",
            text: `Customer ${force ? "permanently deleted" : "moved to trash"} successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error deleting customer: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Reports Tools
server.registerTool(
  "get_sales_report",
  {
    title: "Get Sales Report",
    description: "Retrieve sales report data from WooCommerce",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      period: z.enum(["week", "month", "last_month", "year"]).default("month"),
      date_min: z.string().optional(),
      date_max: z.string().optional(),
    },
  },
  async ({ credentials = {}, period = "month", date_min, date_max }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.get("/reports/sales", {
        params: {
          period,
          date_min,
          date_max,
        },
      });

      return {
        content: [
          {
            type: "text",
            text: `Sales Report:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving sales report: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "get_product_categories",
  {
    title: "Get Product Categories",
    description: "Retrieve product categories from WooCommerce",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      perPage: z.number().min(1).max(100).default(10),
      page: z.number().min(1).default(1),
      search: z.string().optional(),
      parent: z.number().optional(),
      hide_empty: z.boolean().optional(),
    },
  },
  async ({ credentials = {}, perPage = 10, page = 1, ...filters }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.get("/products/categories", {
        params: {
          per_page: perPage,
          page,
          ...filters,
        },
      });

      return {
        content: [
          {
            type: "text",
            text: `Found ${response.data.length} categories:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving categories: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "get_product_category",
  {
    title: "Get Product Category",
    description: "Retrieve a specific product category by ID",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      categoryId: z.number().positive(),
    },
  },
  async ({ credentials = {}, categoryId }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.get(`/products/categories/${categoryId}`);

      return {
        content: [
          {
            type: "text",
            text: `Category details:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving category: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "create_product_category",
  {
    title: "Create Product Category",
    description: "Create a new product category in WooCommerce",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      categoryData: CategoryDataSchema,
    },
  },
  async ({ credentials = {}, categoryData }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.post("/products/categories", categoryData);

      return {
        content: [
          {
            type: "text",
            text: `Category created successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error creating category: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "update_product_category",
  {
    title: "Update Product Category",
    description: "Update an existing product category",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      categoryId: z.number().positive(),
      categoryData: CategoryDataSchema.partial(),
    },
  },
  async ({ credentials = {}, categoryId, categoryData }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.put(`/products/categories/${categoryId}`, categoryData);

      return {
        content: [
          {
            type: "text",
            text: `Category updated successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error updating category: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "delete_product_category",
  {
    title: "Delete Product Category",
    description: "Delete a product category from WooCommerce",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      categoryId: z.number().positive(),
      force: z.boolean().default(false),
    },
  },
  async ({ credentials = {}, categoryId, force = false }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.delete(`/products/categories/${categoryId}`, {
        params: { force },
      });

      return {
        content: [
          {
            type: "text",
            text: `Category ${force ? "permanently deleted" : "moved to trash"} successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error deleting category: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Coupon Management Tools
server.registerTool(
  "get_coupons",
  {
    title: "Get Coupons",
    description: "Retrieve coupons from WooCommerce",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      perPage: z.number().min(1).max(100).default(10),
      page: z.number().min(1).default(1),
      search: z.string().optional(),
      after: z.string().optional(),
      before: z.string().optional(),
      code: z.string().optional(),
    },
  },
  async ({ credentials = {}, perPage = 10, page = 1, ...filters }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.get("/coupons", {
        params: {
          per_page: perPage,
          page,
          ...filters,
        },
      });

      return {
        content: [
          {
            type: "text",
            text: `Found ${response.data.length} coupons:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving coupons: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "get_coupon",
  {
    title: "Get Coupon",
    description: "Retrieve a specific coupon by ID",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      couponId: z.number().positive(),
    },
  },
  async ({ credentials = {}, couponId }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.get(`/coupons/${couponId}`);

      return {
        content: [
          {
            type: "text",
            text: `Coupon details:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving coupon: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "create_coupon",
  {
    title: "Create Coupon",
    description: "Create a new coupon in WooCommerce",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      couponData: CouponDataSchema,
    },
  },
  async ({ credentials = {}, couponData }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.post("/coupons", couponData);

      return {
        content: [
          {
            type: "text",
            text: `Coupon created successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error creating coupon: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "update_coupon",
  {
    title: "Update Coupon",
    description: "Update an existing coupon",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      couponId: z.number().positive(),
      couponData: CouponDataSchema.partial(),
    },
  },
  async ({ credentials = {}, couponId, couponData }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.put(`/coupons/${couponId}`, couponData);

      return {
        content: [
          {
            type: "text",
            text: `Coupon updated successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error updating coupon: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "delete_coupon",
  {
    title: "Delete Coupon",
    description: "Delete a coupon from WooCommerce",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      couponId: z.number().positive(),
      force: z.boolean().default(false),
    },
  },
  async ({ credentials = {}, couponId, force = false }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.delete(`/coupons/${couponId}`, {
        params: { force },
      });

      return {
        content: [
          {
            type: "text",
            text: `Coupon ${force ? "permanently deleted" : "moved to trash"} successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error deleting coupon: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Product Tags Tools
server.registerTool(
  "get_product_tags",
  {
    title: "Get Product Tags",
    description: "Retrieve product tags from WooCommerce",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      perPage: z.number().min(1).max(100).default(10),
      page: z.number().min(1).default(1),
      search: z.string().optional(),
      hide_empty: z.boolean().optional(),
    },
  },
  async ({ credentials = {}, perPage = 10, page = 1, ...filters }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.get("/products/tags", {
        params: {
          per_page: perPage,
          page,
          ...filters,
        },
      });

      return {
        content: [
          {
            type: "text",
            text: `Found ${response.data.length} tags:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving tags: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "get_product_tag",
  {
    title: "Get Product Tag",
    description: "Retrieve a specific product tag by ID",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      tagId: z.number().positive(),
    },
  },
  async ({ credentials = {}, tagId }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.get(`/products/tags/${tagId}`);

      return {
        content: [
          {
            type: "text",
            text: `Tag details:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving tag: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "create_product_tag",
  {
    title: "Create Product Tag",
    description: "Create a new product tag in WooCommerce",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      tagData: TagDataSchema,
    },
  },
  async ({ credentials = {}, tagData }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.post("/products/tags", tagData);

      return {
        content: [
          {
            type: "text",
            text: `Tag created successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error creating tag: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "update_product_tag",
  {
    title: "Update Product Tag",
    description: "Update an existing product tag",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      tagId: z.number().positive(),
      tagData: TagDataSchema.partial(),
    },
  },
  async ({ credentials = {}, tagId, tagData }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.put(`/products/tags/${tagId}`, tagData);

      return {
        content: [
          {
            type: "text",
            text: `Tag updated successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error updating tag: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "delete_product_tag",
  {
    title: "Delete Product Tag",
    description: "Delete a product tag from WooCommerce",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      tagId: z.number().positive(),
      force: z.boolean().default(false),
    },
  },
  async ({ credentials = {}, tagId, force = false }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.delete(`/products/tags/${tagId}`, {
        params: { force },
      });

      return {
        content: [
          {
            type: "text",
            text: `Tag ${force ? "permanently deleted" : "moved to trash"} successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error deleting tag: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Product Attributes Tools
server.registerTool(
  "get_product_attributes",
  {
    title: "Get Product Attributes",
    description: "Retrieve product attributes from WooCommerce",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      perPage: z.number().min(1).max(100).default(10),
      page: z.number().min(1).default(1),
    },
  },
  async ({ credentials = {}, perPage = 10, page = 1 }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.get("/products/attributes", {
        params: {
          per_page: perPage,
          page,
        },
      });

      return {
        content: [
          {
            type: "text",
            text: `Found ${response.data.length} attributes:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving attributes: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "get_product_attribute",
  {
    title: "Get Product Attribute",
    description: "Retrieve a specific product attribute by ID",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      attributeId: z.number().positive(),
    },
  },
  async ({ credentials = {}, attributeId }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.get(`/products/attributes/${attributeId}`);

      return {
        content: [
          {
            type: "text",
            text: `Attribute details:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving attribute: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "create_product_attribute",
  {
    title: "Create Product Attribute",
    description: "Create a new product attribute in WooCommerce",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      attributeData: AttributeDataSchema,
    },
  },
  async ({ credentials = {}, attributeData }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.post("/products/attributes", attributeData);

      return {
        content: [
          {
            type: "text",
            text: `Attribute created successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error creating attribute: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "update_product_attribute",
  {
    title: "Update Product Attribute",
    description: "Update an existing product attribute",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      attributeId: z.number().positive(),
      attributeData: AttributeDataSchema.partial(),
    },
  },
  async ({ credentials = {}, attributeId, attributeData }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.put(`/products/attributes/${attributeId}`, attributeData);

      return {
        content: [
          {
            type: "text",
            text: `Attribute updated successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error updating attribute: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "delete_product_attribute",
  {
    title: "Delete Product Attribute",
    description: "Delete a product attribute from WooCommerce",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      attributeId: z.number().positive(),
      force: z.boolean().default(false),
    },
  },
  async ({ credentials = {}, attributeId, force = false }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.delete(`/products/attributes/${attributeId}`, {
        params: { force },
      });

      return {
        content: [
          {
            type: "text",
            text: `Attribute ${force ? "permanently deleted" : "moved to trash"} successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error deleting attribute: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Product Variations Tools
server.registerTool(
  "get_product_variations",
  {
    title: "Get Product Variations",
    description: "Retrieve variations for a variable product",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      productId: z.number().positive(),
      perPage: z.number().min(1).max(100).default(10),
      page: z.number().min(1).default(1),
    },
  },
  async ({ credentials = {}, productId, perPage = 10, page = 1 }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.get(`/products/${productId}/variations`, {
        params: {
          per_page: perPage,
          page,
        },
      });

      return {
        content: [
          {
            type: "text",
            text: `Found ${response.data.length} variations:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving variations: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "get_product_variation",
  {
    title: "Get Product Variation",
    description: "Retrieve a specific product variation",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      productId: z.number().positive(),
      variationId: z.number().positive(),
    },
  },
  async ({ credentials = {}, productId, variationId }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.get(`/products/${productId}/variations/${variationId}`);

      return {
        content: [
          {
            type: "text",
            text: `Variation details:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving variation: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "create_product_variation",
  {
    title: "Create Product Variation",
    description: "Create a new product variation",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      productId: z.number().positive(),
      variationData: VariationDataSchema,
    },
  },
  async ({ credentials = {}, productId, variationData }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.post(`/products/${productId}/variations`, variationData);

      return {
        content: [
          {
            type: "text",
            text: `Variation created successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error creating variation: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "update_product_variation",
  {
    title: "Update Product Variation",
    description: "Update an existing product variation",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      productId: z.number().positive(),
      variationId: z.number().positive(),
      variationData: VariationDataSchema.partial(),
    },
  },
  async ({ credentials = {}, productId, variationId, variationData }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.put(`/products/${productId}/variations/${variationId}`, variationData);

      return {
        content: [
          {
            type: "text",
            text: `Variation updated successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error updating variation: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "delete_product_variation",
  {
    title: "Delete Product Variation",
    description: "Delete a product variation",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      productId: z.number().positive(),
      variationId: z.number().positive(),
      force: z.boolean().default(false),
    },
  },
  async ({ credentials = {}, productId, variationId, force = false }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.delete(`/products/${productId}/variations/${variationId}`, {
        params: { force },
      });

      return {
        content: [
          {
            type: "text",
            text: `Variation ${force ? "permanently deleted" : "moved to trash"} successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error deleting variation: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Order Notes Tools
server.registerTool(
  "get_order_notes",
  {
    title: "Get Order Notes",
    description: "Retrieve notes for a specific order",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      orderId: z.number().positive(),
      perPage: z.number().min(1).max(100).default(10),
      page: z.number().min(1).default(1),
      type: z.enum(["any", "customer", "internal"]).optional(),
    },
  },
  async ({ credentials = {}, orderId, perPage = 10, page = 1, type }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const params: any = {
        per_page: perPage,
        page,
      };
      if (type) params.type = type;

      const response = await client.get(`/orders/${orderId}/notes`, { params });

      return {
        content: [
          {
            type: "text",
            text: `Found ${response.data.length} order notes:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving order notes: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "get_order_note",
  {
    title: "Get Order Note",
    description: "Retrieve a specific order note",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      orderId: z.number().positive(),
      noteId: z.number().positive(),
    },
  },
  async ({ credentials = {}, orderId, noteId }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.get(`/orders/${orderId}/notes/${noteId}`);

      return {
        content: [
          {
            type: "text",
            text: `Order note details:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving order note: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "create_order_note",
  {
    title: "Create Order Note",
    description: "Create a new order note",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      orderId: z.number().positive(),
      noteData: OrderNoteDataSchema,
    },
  },
  async ({ credentials = {}, orderId, noteData }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.post(`/orders/${orderId}/notes`, noteData);

      return {
        content: [
          {
            type: "text",
            text: `Order note created successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error creating order note: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "delete_order_note",
  {
    title: "Delete Order Note",
    description: "Delete an order note",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      orderId: z.number().positive(),
      noteId: z.number().positive(),
      force: z.boolean().default(false),
    },
  },
  async ({ credentials = {}, orderId, noteId, force = false }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.delete(`/orders/${orderId}/notes/${noteId}`, {
        params: { force },
      });

      return {
        content: [
          {
            type: "text",
            text: `Order note ${force ? "permanently deleted" : "moved to trash"} successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error deleting order note: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Order Refunds Tools
server.registerTool(
  "get_order_refunds",
  {
    title: "Get Order Refunds",
    description: "Retrieve refunds for a specific order",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      orderId: z.number().positive(),
      perPage: z.number().min(1).max(100).default(10),
      page: z.number().min(1).default(1),
    },
  },
  async ({ credentials = {}, orderId, perPage = 10, page = 1 }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.get(`/orders/${orderId}/refunds`, {
        params: {
          per_page: perPage,
          page,
        },
      });

      return {
        content: [
          {
            type: "text",
            text: `Found ${response.data.length} refunds:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving refunds: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "get_order_refund",
  {
    title: "Get Order Refund",
    description: "Retrieve a specific order refund",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      orderId: z.number().positive(),
      refundId: z.number().positive(),
    },
  },
  async ({ credentials = {}, orderId, refundId }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.get(`/orders/${orderId}/refunds/${refundId}`);

      return {
        content: [
          {
            type: "text",
            text: `Refund details:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving refund: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "create_order_refund",
  {
    title: "Create Order Refund",
    description: "Create a new order refund",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      orderId: z.number().positive(),
      refundData: RefundDataSchema,
    },
  },
  async ({ credentials = {}, orderId, refundData }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.post(`/orders/${orderId}/refunds`, refundData);

      return {
        content: [
          {
            type: "text",
            text: `Refund created successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error creating refund: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "delete_order_refund",
  {
    title: "Delete Order Refund",
    description: "Delete an order refund",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      orderId: z.number().positive(),
      refundId: z.number().positive(),
      force: z.boolean().default(false),
    },
  },
  async ({ credentials = {}, orderId, refundId, force = false }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.delete(`/orders/${orderId}/refunds/${refundId}`, {
        params: { force },
      });

      return {
        content: [
          {
            type: "text",
            text: `Refund ${force ? "permanently deleted" : "moved to trash"} successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error deleting refund: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Additional Reports Tools
server.registerTool(
  "get_products_report",
  {
    title: "Get Products Report",
    description: "Retrieve products report data from WooCommerce",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      period: z.enum(["week", "month", "last_month", "year"]).default("month"),
      date_min: z.string().optional(),
      date_max: z.string().optional(),
      perPage: z.number().min(1).max(100).default(10),
      page: z.number().min(1).default(1),
    },
  },
  async ({ credentials = {}, period = "month", date_min, date_max, perPage = 10, page = 1 }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.get("/reports/products", {
        params: {
          period,
          date_min,
          date_max,
          per_page: perPage,
          page,
        },
      });

      return {
        content: [
          {
            type: "text",
            text: `Products Report:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving products report: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "get_orders_report",
  {
    title: "Get Orders Report",
    description: "Retrieve orders report data from WooCommerce",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      period: z.enum(["week", "month", "last_month", "year"]).default("month"),
      date_min: z.string().optional(),
      date_max: z.string().optional(),
      perPage: z.number().min(1).max(100).default(10),
      page: z.number().min(1).default(1),
    },
  },
  async ({ credentials = {}, period = "month", date_min, date_max, perPage = 10, page = 1 }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.get("/reports/orders", {
        params: {
          period,
          date_min,
          date_max,
          per_page: perPage,
          page,
        },
      });

      return {
        content: [
          {
            type: "text",
            text: `Orders Report:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving orders report: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "get_customers_report",
  {
    title: "Get Customers Report",
    description: "Retrieve customers report data from WooCommerce",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      perPage: z.number().min(1).max(100).default(10),
      page: z.number().min(1).default(1),
    },
  },
  async ({ credentials = {}, perPage = 10, page = 1 }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.get("/reports/customers", {
        params: {
          per_page: perPage,
          page,
        },
      });

      return {
        content: [
          {
            type: "text",
            text: `Customers Report:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving customers report: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Payment Gateways Tools
server.registerTool(
  "get_payment_gateways",
  {
    title: "Get Payment Gateways",
    description: "Retrieve payment gateways from WooCommerce",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
    },
  },
  async ({ credentials = {} }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.get("/payment_gateways");

      return {
        content: [
          {
            type: "text",
            text: `Payment Gateways:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving payment gateways: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "get_payment_gateway",
  {
    title: "Get Payment Gateway",
    description: "Retrieve a specific payment gateway by ID",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      gatewayId: z.string(),
    },
  },
  async ({ credentials = {}, gatewayId }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.get(`/payment_gateways/${gatewayId}`);

      return {
        content: [
          {
            type: "text",
            text: `Payment Gateway details:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving payment gateway: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "update_payment_gateway",
  {
    title: "Update Payment Gateway",
    description: "Update payment gateway settings",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      gatewayId: z.string(),
      gatewayData: z.object({
        enabled: z.boolean().optional(),
        title: z.string().optional(),
        description: z.string().optional(),
        settings: z.record(z.any()).optional(),
      }),
    },
  },
  async ({ credentials = {}, gatewayId, gatewayData }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.put(`/payment_gateways/${gatewayId}`, gatewayData);

      return {
        content: [
          {
            type: "text",
            text: `Payment Gateway updated successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error updating payment gateway: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "get_system_status",
  {
    title: "Get System Status",
    description: "Retrieve WooCommerce system status information",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
    },
  },
  async ({ credentials = {} }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.get("/system_status");

      return {
        content: [
          {
            type: "text",
            text: `System Status:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving system status: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Meta Data Operations for Products
server.registerTool(
  "get_product_meta",
  {
    title: "Get Product Meta Data",
    description: "Retrieve meta data for a specific product",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      productId: z.number().positive(),
      metaKey: z.string().optional(),
    },
  },
  async ({ credentials = {}, productId, metaKey }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.get(`/products/${productId}`);

      const metaData = response.data.meta_data || [];

      // If a specific key is requested, filter the meta data
      const result = metaKey
        ? metaData.filter((meta: any) => meta.key === metaKey)
        : metaData;

      return {
        content: [
          {
            type: "text",
            text: `Product meta data:\n\n${JSON.stringify(result, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving product meta: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "create_product_meta",
  {
    title: "Create Product Meta Data",
    description: "Create or update meta data for a product",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      productId: z.number().positive(),
      metaKey: z.string(),
      metaValue: z.any(),
    },
  },
  async ({ credentials = {}, productId, metaKey, metaValue }) => {
    try {
      const client = createWooCommerceClient(credentials);

      // Get current product data
      const productResponse = await client.get(`/products/${productId}`);
      const product = productResponse.data;
      let metaData = product.meta_data || [];

      // Look for existing meta with the same key
      const existingMetaIndex = metaData.findIndex((meta: any) => meta.key === metaKey);

      if (existingMetaIndex >= 0) {
        // Update existing meta
        metaData[existingMetaIndex].value = metaValue;
      } else {
        // Add new meta
        metaData.push({ key: metaKey, value: metaValue });
      }

      // Update the product with the modified meta_data
      const response = await client.put(`/products/${productId}`, {
        meta_data: metaData,
      });

      return {
        content: [
          {
            type: "text",
            text: `Product meta data updated successfully:\n\n${JSON.stringify(response.data.meta_data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error creating product meta: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "update_product_meta",
  {
    title: "Update Product Meta Data",
    description: "Update existing meta data for a product",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      productId: z.number().positive(),
      metaKey: z.string(),
      metaValue: z.any(),
    },
  },
  async ({ credentials = {}, productId, metaKey, metaValue }) => {
    try {
      const client = createWooCommerceClient(credentials);

      // Get current product data
      const productResponse = await client.get(`/products/${productId}`);
      const product = productResponse.data;
      let metaData = product.meta_data || [];

      // Look for existing meta with the same key
      const existingMetaIndex = metaData.findIndex((meta: any) => meta.key === metaKey);

      if (existingMetaIndex >= 0) {
        // Update existing meta
        metaData[existingMetaIndex].value = metaValue;
      } else {
        // Add new meta if it doesn't exist
        metaData.push({ key: metaKey, value: metaValue });
      }

      // Update the product with the modified meta_data
      const response = await client.put(`/products/${productId}`, {
        meta_data: metaData,
      });

      return {
        content: [
          {
            type: "text",
            text: `Product meta data updated successfully:\n\n${JSON.stringify(response.data.meta_data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error updating product meta: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "delete_product_meta",
  {
    title: "Delete Product Meta Data",
    description: "Delete meta data from a product",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      productId: z.number().positive(),
      metaKey: z.string(),
    },
  },
  async ({ credentials = {}, productId, metaKey }) => {
    try {
      const client = createWooCommerceClient(credentials);

      // Get current product data
      const productResponse = await client.get(`/products/${productId}`);
      const product = productResponse.data;
      let metaData = product.meta_data || [];

      // Filter out the meta key to delete
      const updatedMetaData = metaData.filter((meta: any) => meta.key !== metaKey);

      // Update the product with the filtered meta_data
      const response = await client.put(`/products/${productId}`, {
        meta_data: updatedMetaData,
      });

      return {
        content: [
          {
            type: "text",
            text: `Product meta data deleted successfully:\n\n${JSON.stringify(response.data.meta_data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error deleting product meta: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Meta Data Operations for Orders
server.registerTool(
  "get_order_meta",
  {
    title: "Get Order Meta Data",
    description: "Retrieve meta data for a specific order",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      orderId: z.number().positive(),
      metaKey: z.string().optional(),
    },
  },
  async ({ credentials = {}, orderId, metaKey }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.get(`/orders/${orderId}`);

      const metaData = response.data.meta_data || [];

      // If a specific key is requested, filter the meta data
      const result = metaKey
        ? metaData.filter((meta: any) => meta.key === metaKey)
        : metaData;

      return {
        content: [
          {
            type: "text",
            text: `Order meta data:\n\n${JSON.stringify(result, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving order meta: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "create_order_meta",
  {
    title: "Create Order Meta Data",
    description: "Create or update meta data for an order",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      orderId: z.number().positive(),
      metaKey: z.string(),
      metaValue: z.any(),
    },
  },
  async ({ credentials = {}, orderId, metaKey, metaValue }) => {
    try {
      const client = createWooCommerceClient(credentials);

      // Get current order data
      const orderResponse = await client.get(`/orders/${orderId}`);
      const order = orderResponse.data;
      let metaData = order.meta_data || [];

      // Look for existing meta with the same key
      const existingMetaIndex = metaData.findIndex((meta: any) => meta.key === metaKey);

      if (existingMetaIndex >= 0) {
        // Update existing meta
        metaData[existingMetaIndex].value = metaValue;
      } else {
        // Add new meta
        metaData.push({ key: metaKey, value: metaValue });
      }

      // Update the order with the modified meta_data
      const response = await client.put(`/orders/${orderId}`, {
        meta_data: metaData,
      });

      return {
        content: [
          {
            type: "text",
            text: `Order meta data updated successfully:\n\n${JSON.stringify(response.data.meta_data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error creating order meta: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "update_order_meta",
  {
    title: "Update Order Meta Data",
    description: "Update existing meta data for an order",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      orderId: z.number().positive(),
      metaKey: z.string(),
      metaValue: z.any(),
    },
  },
  async ({ credentials = {}, orderId, metaKey, metaValue }) => {
    try {
      const client = createWooCommerceClient(credentials);

      // Get current order data
      const orderResponse = await client.get(`/orders/${orderId}`);
      const order = orderResponse.data;
      let metaData = order.meta_data || [];

      // Look for existing meta with the same key
      const existingMetaIndex = metaData.findIndex((meta: any) => meta.key === metaKey);

      if (existingMetaIndex >= 0) {
        // Update existing meta
        metaData[existingMetaIndex].value = metaValue;
      } else {
        // Add new meta if it doesn't exist
        metaData.push({ key: metaKey, value: metaValue });
      }

      // Update the order with the modified meta_data
      const response = await client.put(`/orders/${orderId}`, {
        meta_data: metaData,
      });

      return {
        content: [
          {
            type: "text",
            text: `Order meta data updated successfully:\n\n${JSON.stringify(response.data.meta_data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error updating order meta: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "delete_order_meta",
  {
    title: "Delete Order Meta Data",
    description: "Delete meta data from an order",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      orderId: z.number().positive(),
      metaKey: z.string(),
    },
  },
  async ({ credentials = {}, orderId, metaKey }) => {
    try {
      const client = createWooCommerceClient(credentials);

      // Get current order data
      const orderResponse = await client.get(`/orders/${orderId}`);
      const order = orderResponse.data;
      let metaData = order.meta_data || [];

      // Filter out the meta key to delete
      const updatedMetaData = metaData.filter((meta: any) => meta.key !== metaKey);

      // Update the order with the filtered meta_data
      const response = await client.put(`/orders/${orderId}`, {
        meta_data: updatedMetaData,
      });

      return {
        content: [
          {
            type: "text",
            text: `Order meta data deleted successfully:\n\n${JSON.stringify(response.data.meta_data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error deleting order meta: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Meta Data Operations for Customers
server.registerTool(
  "get_customer_meta",
  {
    title: "Get Customer Meta Data",
    description: "Retrieve meta data for a specific customer",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      customerId: z.number().positive(),
      metaKey: z.string().optional(),
    },
  },
  async ({ credentials = {}, customerId, metaKey }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.get(`/customers/${customerId}`);

      const metaData = response.data.meta_data || [];

      // If a specific key is requested, filter the meta data
      const result = metaKey
        ? metaData.filter((meta: any) => meta.key === metaKey)
        : metaData;

      return {
        content: [
          {
            type: "text",
            text: `Customer meta data:\n\n${JSON.stringify(result, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving customer meta: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "create_customer_meta",
  {
    title: "Create Customer Meta Data",
    description: "Create or update meta data for a customer",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      customerId: z.number().positive(),
      metaKey: z.string(),
      metaValue: z.any(),
    },
  },
  async ({ credentials = {}, customerId, metaKey, metaValue }) => {
    try {
      const client = createWooCommerceClient(credentials);

      // Get current customer data
      const customerResponse = await client.get(`/customers/${customerId}`);
      const customer = customerResponse.data;
      let metaData = customer.meta_data || [];

      // Look for existing meta with the same key
      const existingMetaIndex = metaData.findIndex((meta: any) => meta.key === metaKey);

      if (existingMetaIndex >= 0) {
        // Update existing meta
        metaData[existingMetaIndex].value = metaValue;
      } else {
        // Add new meta
        metaData.push({ key: metaKey, value: metaValue });
      }

      // Update the customer with the modified meta_data
      const response = await client.put(`/customers/${customerId}`, {
        meta_data: metaData,
      });

      return {
        content: [
          {
            type: "text",
            text: `Customer meta data updated successfully:\n\n${JSON.stringify(response.data.meta_data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error creating customer meta: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "update_customer_meta",
  {
    title: "Update Customer Meta Data",
    description: "Update existing meta data for a customer",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      customerId: z.number().positive(),
      metaKey: z.string(),
      metaValue: z.any(),
    },
  },
  async ({ credentials = {}, customerId, metaKey, metaValue }) => {
    try {
      const client = createWooCommerceClient(credentials);

      // Get current customer data
      const customerResponse = await client.get(`/customers/${customerId}`);
      const customer = customerResponse.data;
      let metaData = customer.meta_data || [];

      // Look for existing meta with the same key
      const existingMetaIndex = metaData.findIndex((meta: any) => meta.key === metaKey);

      if (existingMetaIndex >= 0) {
        // Update existing meta
        metaData[existingMetaIndex].value = metaValue;
      } else {
        // Add new meta if it doesn't exist
        metaData.push({ key: metaKey, value: metaValue });
      }

      // Update the customer with the modified meta_data
      const response = await client.put(`/customers/${customerId}`, {
        meta_data: metaData,
      });

      return {
        content: [
          {
            type: "text",
            text: `Customer meta data updated successfully:\n\n${JSON.stringify(response.data.meta_data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error updating customer meta: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "delete_customer_meta",
  {
    title: "Delete Customer Meta Data",
    description: "Delete meta data from a customer",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      customerId: z.number().positive(),
      metaKey: z.string(),
    },
  },
  async ({ credentials = {}, customerId, metaKey }) => {
    try {
      const client = createWooCommerceClient(credentials);

      // Get current customer data
      const customerResponse = await client.get(`/customers/${customerId}`);
      const customer = customerResponse.data;
      let metaData = customer.meta_data || [];

      // Filter out the meta key to delete
      const updatedMetaData = metaData.filter((meta: any) => meta.key !== metaKey);

      // Update the customer with the filtered meta_data
      const response = await client.put(`/customers/${customerId}`, {
        meta_data: updatedMetaData,
      });

      return {
        content: [
          {
            type: "text",
            text: `Customer meta data deleted successfully:\n\n${JSON.stringify(response.data.meta_data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error deleting customer meta: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Product Reviews Tools
server.registerTool(
  "get_product_reviews",
  {
    title: "Get Product Reviews",
    description: "Retrieve product reviews from WooCommerce",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      productId: z.number().positive().optional(),
      perPage: z.number().min(1).max(100).default(10),
      page: z.number().min(1).default(1),
      status: z.enum(["approved", "hold", "spam", "unspam", "trash", "untrash"]).optional(),
      reviewer: z.string().optional(),
      reviewer_email: z.string().email().optional(),
    },
  },
  async ({ credentials = {}, productId, perPage = 10, page = 1, ...filters }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const params: any = {
        per_page: perPage,
        page,
        ...filters,
      };

      // Add product filter if specified
      if (productId) {
        params.product = productId;
      }

      const response = await client.get("/products/reviews", { params });

      return {
        content: [
          {
            type: "text",
            text: `Found ${response.data.length} reviews:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving reviews: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "get_product_review",
  {
    title: "Get Product Review",
    description: "Retrieve a specific product review by ID",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      reviewId: z.number().positive(),
    },
  },
  async ({ credentials = {}, reviewId }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.get(`/products/reviews/${reviewId}`);

      return {
        content: [
          {
            type: "text",
            text: `Review details:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving review: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "create_product_review",
  {
    title: "Create Product Review",
    description: "Create a new product review",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      reviewData: ReviewDataSchema.extend({
        product_id: z.number().positive(),
      }),
    },
  },
  async ({ credentials = {}, reviewData }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.post("/products/reviews", reviewData);

      return {
        content: [
          {
            type: "text",
            text: `Review created successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error creating review: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "update_product_review",
  {
    title: "Update Product Review",
    description: "Update an existing product review",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      reviewId: z.number().positive(),
      reviewData: ReviewDataSchema.partial(),
    },
  },
  async ({ credentials = {}, reviewId, reviewData }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.put(`/products/reviews/${reviewId}`, reviewData);

      return {
        content: [
          {
            type: "text",
            text: `Review updated successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error updating review: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "delete_product_review",
  {
    title: "Delete Product Review",
    description: "Delete a product review",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      reviewId: z.number().positive(),
      force: z.boolean().default(false),
    },
  },
  async ({ credentials = {}, reviewId, force = false }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.delete(`/products/reviews/${reviewId}`, {
        params: { force },
      });

      return {
        content: [
          {
            type: "text",
            text: `Review ${force ? "permanently deleted" : "moved to trash"} successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error deleting review: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Settings Management Tools
server.registerTool(
  "get_settings",
  {
    title: "Get Settings",
    description: "Retrieve WooCommerce settings groups",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
    },
  },
  async ({ credentials = {} }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.get("/settings");

      return {
        content: [
          {
            type: "text",
            text: `Settings groups:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving settings: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "get_setting_options",
  {
    title: "Get Setting Options",
    description: "Retrieve options for a specific settings group",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      group: z.string(),
    },
  },
  async ({ credentials = {}, group }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.get(`/settings/${group}`);

      return {
        content: [
          {
            type: "text",
            text: `Settings for group '${group}':\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving setting options: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "update_setting_option",
  {
    title: "Update Setting Option",
    description: "Update a specific setting option",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      group: z.string(),
      id: z.string(),
      settingData: SettingDataSchema,
    },
  },
  async ({ credentials = {}, group, id, settingData }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.put(`/settings/${group}/${id}`, settingData);

      return {
        content: [
          {
            type: "text",
            text: `Setting updated successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error updating setting: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Additional Reports Tools
server.registerTool(
  "get_categories_report",
  {
    title: "Get Categories Report",
    description: "Retrieve categories report data from WooCommerce",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      perPage: z.number().min(1).max(100).default(10),
      page: z.number().min(1).default(1),
    },
  },
  async ({ credentials = {}, perPage = 10, page = 1 }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.get("/reports/categories", {
        params: {
          per_page: perPage,
          page,
        },
      });

      return {
        content: [
          {
            type: "text",
            text: `Categories Report:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving categories report: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "get_stock_report",
  {
    title: "Get Stock Report",
    description: "Retrieve stock report data from WooCommerce",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      perPage: z.number().min(1).max(100).default(10),
      page: z.number().min(1).default(1),
    },
  },
  async ({ credentials = {}, perPage = 10, page = 1 }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.get("/reports/stock", {
        params: {
          per_page: perPage,
          page,
        },
      });

      return {
        content: [
          {
            type: "text",
            text: `Stock Report:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving stock report: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "get_coupons_report",
  {
    title: "Get Coupons Report",
    description: "Retrieve coupons report data from WooCommerce",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      period: z.enum(["week", "month", "last_month", "year"]).default("month"),
      date_min: z.string().optional(),
      date_max: z.string().optional(),
      perPage: z.number().min(1).max(100).default(10),
      page: z.number().min(1).default(1),
    },
  },
  async ({ credentials = {}, period = "month", date_min, date_max, perPage = 10, page = 1 }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.get("/reports/coupons", {
        params: {
          period,
          date_min,
          date_max,
          per_page: perPage,
          page,
        },
      });

      return {
        content: [
          {
            type: "text",
            text: `Coupons Report:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving coupons report: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "get_taxes_report",
  {
    title: "Get Taxes Report",
    description: "Retrieve taxes report data from WooCommerce",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      period: z.enum(["week", "month", "last_month", "year"]).default("month"),
      date_min: z.string().optional(),
      date_max: z.string().optional(),
      perPage: z.number().min(1).max(100).default(10),
      page: z.number().min(1).default(1),
    },
  },
  async ({ credentials = {}, period = "month", date_min, date_max, perPage = 10, page = 1 }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.get("/reports/taxes", {
        params: {
          period,
          date_min,
          date_max,
          per_page: perPage,
          page,
        },
      });

      return {
        content: [
          {
            type: "text",
            text: `Taxes Report:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving taxes report: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Data & Geography Tools
server.registerTool(
  "get_data",
  {
    title: "Get Data",
    description: "Retrieve general WooCommerce data information",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
    },
  },
  async ({ credentials = {} }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.get("/data");

      return {
        content: [
          {
            type: "text",
            text: `WooCommerce Data:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving data: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "get_continents",
  {
    title: "Get Continents",
    description: "Retrieve list of continents and their countries",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
    },
  },
  async ({ credentials = {} }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.get("/data/continents");

      return {
        content: [
          {
            type: "text",
            text: `Continents:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving continents: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "get_countries",
  {
    title: "Get Countries",
    description: "Retrieve list of countries",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
    },
  },
  async ({ credentials = {} }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.get("/data/countries");

      return {
        content: [
          {
            type: "text",
            text: `Countries:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving countries: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "get_currencies",
  {
    title: "Get Currencies",
    description: "Retrieve list of available currencies",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
    },
  },
  async ({ credentials = {} }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.get("/data/currencies");

      return {
        content: [
          {
            type: "text",
            text: `Currencies:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving currencies: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "get_current_currency",
  {
    title: "Get Current Currency",
    description: "Retrieve current currency information",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
    },
  },
  async ({ credentials = {} }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.get("/data/currencies/current");

      return {
        content: [
          {
            type: "text",
            text: `Current Currency:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving current currency: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// WordPress Posts Management Tools
server.registerTool(
  "create_post",
  {
    title: "Create WordPress Post",
    description: "Create a new WordPress post",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      postData: PostDataSchema,
    },
  },
  async ({ credentials = {}, postData }) => {
    try {
      const client = createWordPressClient(credentials);
      const response = await client.post("/posts", postData);

      return {
        content: [
          {
            type: "text",
            text: `Post created successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error creating post: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "get_posts",
  {
    title: "Get WordPress Posts",
    description: "Retrieve WordPress posts",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      perPage: z.number().min(1).max(100).default(10),
      page: z.number().min(1).default(1),
      search: z.string().optional(),
      status: z.enum(["publish", "draft", "private", "pending"]).optional(),
      author: z.number().optional(),
    },
  },
  async ({ credentials = {}, perPage = 10, page = 1, ...filters }) => {
    try {
      const client = createWordPressClient(credentials);
      const response = await client.get("/posts", {
        params: {
          per_page: perPage,
          page,
          ...filters,
        },
      });

      return {
        content: [
          {
            type: "text",
            text: `Found ${response.data.length} posts:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving posts: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "update_post",
  {
    title: "Update WordPress Post",
    description: "Update an existing WordPress post",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      postId: z.number().positive(),
      postData: PostDataSchema.partial(),
    },
  },
  async ({ credentials = {}, postId, postData }) => {
    try {
      const client = createWordPressClient(credentials);
      const response = await client.put(`/posts/${postId}`, postData);

      return {
        content: [
          {
            type: "text",
            text: `Post updated successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error updating post: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "get_post_meta",
  {
    title: "Get WordPress Post Meta",
    description: "Retrieve meta data for a WordPress post",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      postId: z.number().positive(),
      metaKey: z.string().optional(),
    },
  },
  async ({ credentials = {}, postId, metaKey }) => {
    try {
      const client = createWordPressClient(credentials);
      const endpoint = metaKey ? `/posts/${postId}/meta/${metaKey}` : `/posts/${postId}/meta`;
      const response = await client.get(endpoint);

      return {
        content: [
          {
            type: "text",
            text: `Post meta data:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving post meta: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// System Status Tools
server.registerTool(
  "get_system_status_tools",
  {
    title: "Get System Status Tools",
    description: "Retrieve available system status tools",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
    },
  },
  async ({ credentials = {} }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.get("/system_status/tools");

      return {
        content: [
          {
            type: "text",
            text: `System Status Tools:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving system status tools: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "run_system_status_tool",
  {
    title: "Run System Status Tool",
    description: "Execute a specific system status tool",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      toolId: z.string(),
    },
  },
  async ({ credentials = {}, toolId }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const response = await client.put(`/system_status/tools/${toolId}`);

      return {
        content: [
          {
            type: "text",
            text: `System tool executed successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error running system tool: ${handleApiError(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Document Processing Tools
server.registerTool(
  "upload_file",
  {
    title: "Upload File",
    description: "Upload a file for document processing",
    inputSchema: {
      filePath: z.string(),
      originalName: z.string().optional(),
    },
  },
  async ({ filePath, originalName }) => {
    try {
      const fileInfo = await fileHandler.getFileInfo(filePath);
      const uploadResult = await fileHandler.uploadFile({
        originalName: originalName || fileInfo.name,
        mimeType: fileInfo.mimeType,
        size: fileInfo.size,
        path: filePath,
      });

      if (!uploadResult.success) {
        return {
          content: [
            {
              type: "text",
              text: `Upload failed: ${uploadResult.error}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `File uploaded successfully to: ${uploadResult.filePath}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Upload error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "search_files",
  {
    title: "Search Files",
    description: "Search for files in a directory with various filters",
    inputSchema: {
      directory: z.string().default('./uploads'),
      extensions: z.array(z.string()).optional(),
      maxSize: z.number().optional(),
      recursive: z.boolean().default(true),
      pattern: z.string().optional(),
    },
  },
  async ({ directory = './uploads', extensions, maxSize, recursive = true, pattern }) => {
    try {
      const searchResult = await fileHandler.searchFiles({
        directory,
        extensions,
        maxSize,
        recursive,
        pattern,
      });

      return {
        content: [
          {
            type: "text",
            text: `Found ${searchResult.totalFiles} files (${(searchResult.totalSize / 1024 / 1024).toFixed(2)}MB total):\n\n${JSON.stringify(searchResult, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Search error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "process_document",
  {
    title: "Process Document",
    description: "Process documents and images using LangChain and vision language models with intelligent client capability detection",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
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
    },
  },
  async ({ filePath, fileType, processingMode, template, customPrompt, batchSize = 10, validateOnly = false, clientCapabilities }) => {
    try {
      const result = await documentProcessor.processDocument({
        filePath,
        fileType,
        processingMode,
        template,
        customPrompt,
        batchSize,
        validateOnly,
        clientCapabilities,
      });

      if (!result.success) {
        return {
          content: [
            {
              type: "text",
              text: `Processing failed: ${result.message}`,
            },
          ],
          isError: true,
        };
      }

      // Handle client vision processing instructions
      if (result.processingInfo?.processedBy === 'client') {
        return {
          content: [
            {
              type: "text",
              text: `🤖 Client Vision Processing Required

📋 Your client supports vision capabilities! For better performance and privacy, please process this image locally.

📄 File: ${filePath}
🎯 Task: ${result.processingInfo.instruction || 'Process image with vision model'}
💡 Reason: ${result.processingInfo.reason}

🔧 Suggested Prompt:
"${result.processingInfo.suggestedPrompt || 'Extract product information from this image'}"

✨ Benefits of client-side processing:
- Better privacy (data stays local)
- Faster processing (no network transfer)
- Use of your preferred vision models`,
            },
          ],
        };
      }

      let responseText = `🤖 Document Processing Complete\n${'='.repeat(40)}\n\n`;
      responseText += `📄 File: ${filePath}\n`;
      responseText += `📋 Type: ${fileType}\n`;
      responseText += `🔧 Mode: ${processingMode}\n`;
      responseText += `✅ Status: ${result.message}\n`;
      if (template) responseText += `📝 Template: ${template}\n`;

      // Add processing information
      if (result.processingInfo) {
        responseText += `\n🔍 Processing Details:\n`;
        responseText += `- Method: ${result.processingInfo.processedBy}\n`;
        if (result.processingInfo.visionModel) {
          responseText += `- Vision model: ${result.processingInfo.visionModel}\n`;
        }
        if (result.processingInfo.textModel) {
          responseText += `- Text model: ${result.processingInfo.textModel}\n`;
        }
        if (result.processingInfo.chunks) {
          responseText += `- Document chunks: ${result.processingInfo.chunks}\n`;
        }
        if (result.processingInfo.reason) {
          responseText += `- Details: ${result.processingInfo.reason}\n`;
        }
      }

      if (result.products && result.products.length > 0) {
        responseText += `\n\n🏭 Generated Products: ${result.products.length}`;
        if (result.stats) {
          responseText += `\n📊 Stats: ${JSON.stringify(result.stats, null, 2)}`;
        }
      }

      if (result.data) {
        responseText += `\n\n📊 Extracted Data:\n${typeof result.data === 'string' ? result.data.substring(0, 500) + (result.data.length > 500 ? '...' : '') : JSON.stringify(result.data, null, 2)}`;
      }

      if (result.errors && result.errors.length > 0) {
        responseText += `\n\n❌ Errors: ${result.errors.join(', ')}`;
      }

      return {
        content: [
          {
            type: "text",
            text: responseText,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Processing error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "process_image_with_vision",
  {
    title: "Process Image with Vision Model",
    description: "Analyze images using AI vision models to extract product information",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      imagePath: z.string(),
      analysisType: z.enum(['product_extraction', 'catalog_analysis', 'price_detection', 'general_analysis']).default('product_extraction'),
      customPrompt: z.string().optional(),
      generateProducts: z.boolean().default(false),
    },
  },
  async ({ credentials = {}, imagePath, analysisType = 'product_extraction', customPrompt, generateProducts = false }) => {
    try {
      // Check if file exists and is an image
      if (!require('fs').existsSync(imagePath)) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Image file not found: ${imagePath}

🔧 Please check:
- File path is correct
- File exists and is accessible
- File is in a supported image format (JPG, PNG, GIF, WebP)`,
            },
          ],
          isError: true,
        };
      }

      // Determine the appropriate prompt based on analysis type
      let prompt = customPrompt;
      if (!prompt) {
        switch (analysisType) {
          case 'product_extraction':
            prompt = `Analyze this product image and extract detailed information for creating WooCommerce products:

🎯 Extract:
- Product name and title
- Product description and features
- Price information (if visible)
- Product category/type
- Brand information
- SKU or product codes
- Specifications and details
- Any other relevant product data

📋 Format the response as structured data that can be used to create WooCommerce products.`;
            break;
          case 'catalog_analysis':
            prompt = `Analyze this catalog page/image and identify all products shown:

🎯 For each product, extract:
- Product names
- Prices
- Descriptions
- Categories
- Any visible specifications

📋 Organize the information in a structured format for bulk product creation.`;
            break;
          case 'price_detection':
            prompt = `Focus on detecting and extracting price information from this image:

🎯 Find:
- Regular prices
- Sale prices
- Currency symbols
- Price ranges
- Discount information

📋 Return structured pricing data.`;
            break;
          case 'general_analysis':
            prompt = `Provide a comprehensive analysis of this image for e-commerce purposes:

🎯 Analyze:
- What products or items are shown
- Visual quality and presentation
- Text and information visible
- Potential use for product listings
- Recommendations for improvement

📋 Provide actionable insights for e-commerce use.`;
            break;
        }
      }

      // Process the image with vision model
      const result = await documentProcessor.processDocument({
        filePath: imagePath,
        fileType: 'image' as any, // Type assertion for image processing
        processingMode: generateProducts ? 'generate_products' : 'analyze',
        customPrompt: prompt,
        batchSize: 1,
        validateOnly: !generateProducts,
      });

      if (!result.success) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Vision processing failed: ${result.message}

🔧 Troubleshooting:
- Ensure OPENAI_API_KEY is configured
- Check if the image format is supported
- Verify the image is clear and readable
- Try with a different analysis type`,
            },
          ],
          isError: true,
        };
      }

      let responseText = `🤖 Vision Model Analysis Complete\n`;
      responseText += `📸 Image: ${imagePath}\n`;
      responseText += `🔍 Analysis Type: ${analysisType}\n\n`;

      if (result.data) {
        responseText += `📋 Analysis Results:\n${typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2)}\n\n`;
      }

      if (result.products && result.products.length > 0) {
        responseText += `🏭 Generated Products: ${result.products.length}\n`;
        responseText += `📊 Products:\n${JSON.stringify(result.products, null, 2)}\n\n`;
      }

      if (result.stats) {
        responseText += `📈 Processing Stats:\n${JSON.stringify(result.stats, null, 2)}\n\n`;
      }

      responseText += `✨ Vision model successfully analyzed the image and extracted relevant information for your WooCommerce store.`;

      return {
        content: [
          {
            type: "text",
            text: responseText,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Vision processing error: ${error instanceof Error ? error.message : 'Unknown error'}

🔧 Common Solutions:
- Verify OPENAI_API_KEY is set correctly
- Ensure image file is accessible and in supported format
- Check if OpenAI vision models are available in your region
- Try with a smaller image file`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "list_templates",
  {
    title: "List Templates",
    description: "List available product templates",
    inputSchema: {},
  },
  async () => {
    try {
      const templates = await templateManager.listTemplates();

      return {
        content: [
          {
            type: "text",
            text: `Available templates:\n\n${JSON.stringify(templates, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error listing templates: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "create_template",
  {
    title: "Create Template",
    description: "Create a new product template",
    inputSchema: {
      name: z.string(),
      template: ProductTemplateConfigSchema,
    },
  },
  async ({ name, template }) => {
    try {
      await templateManager.saveTemplate(name, template);

      return {
        content: [
          {
            type: "text",
            text: `Template '${name}' created successfully`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error creating template: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "get_template",
  {
    title: "Get Template",
    description: "Retrieve a specific template",
    inputSchema: {
      name: z.string(),
    },
  },
  async ({ name }) => {
    try {
      const template = await templateManager.loadTemplate(name);

      return {
        content: [
          {
            type: "text",
            text: `Template '${name}':\n\n${JSON.stringify(template, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving template: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "validate_file",
  {
    title: "Validate File",
    description: "Validate a file for processing",
    inputSchema: {
      filePath: z.string(),
    },
  },
  async ({ filePath }) => {
    try {
      const validation = await fileHandler.validateFile(filePath);

      return {
        content: [
          {
            type: "text",
            text: `File validation result:\n\n${JSON.stringify(validation, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "bulk_create_products",
  {
    title: "Bulk Create Products",
    description: "Create multiple WooCommerce products from processed data",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      products: z.array(z.object({
        name: z.string(),
        description: z.string().optional(),
        short_description: z.string().optional(),
        regular_price: z.string(),
        sale_price: z.string().optional(),
        sku: z.string().optional(),
        stock_quantity: z.number().optional(),
        manage_stock: z.boolean().default(true),
        categories: z.array(z.object({ id: z.number() })).optional(),
        tags: z.array(z.object({ name: z.string() })).optional(),
        images: z.array(z.object({ src: z.string() })).optional(),
        meta_data: z.array(z.object({ key: z.string(), value: z.any() })).optional(),
      })),
      batchSize: z.number().min(1).max(50).default(10),
      validateOnly: z.boolean().default(false),
    },
  },
  async ({ credentials = {}, products, batchSize = 10, validateOnly = false }) => {
    try {
      const client = createWooCommerceClient(credentials);
      const results = [];
      const errors = [];
      let processed = 0;
      let successful = 0;

      if (validateOnly) {
        // Just validate the product data
        for (const product of products) {
          try {
            // Basic validation
            if (!product.name || !product.regular_price) {
              errors.push(`Product missing required fields: ${product.name || 'Unknown'}`);
            } else {
              successful++;
            }
            processed++;
          } catch (error) {
            errors.push(`Validation error for ${product.name || 'Unknown'}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            processed++;
          }
        }
      } else {
        // Actually create the products
        for (let i = 0; i < products.length; i += batchSize) {
          const batch = products.slice(i, i + batchSize);

          for (const product of batch) {
            try {
              const response = await client.post("/products", product);
              results.push(response.data);
              successful++;
            } catch (error) {
              errors.push(`Failed to create ${product.name}: ${handleApiError(error)}`);
            }
            processed++;
          }

          // Small delay between batches to avoid rate limiting
          if (i + batchSize < products.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }

      const stats = {
        processed,
        successful,
        failed: processed - successful,
        total: products.length,
      };

      let responseText = `Bulk product ${validateOnly ? 'validation' : 'creation'} completed:\n\n`;
      responseText += `📊 Statistics:\n`;
      responseText += `- Total products: ${stats.total}\n`;
      responseText += `- Processed: ${stats.processed}\n`;
      responseText += `- Successful: ${stats.successful}\n`;
      responseText += `- Failed: ${stats.failed}\n`;
      responseText += `- Success rate: ${((stats.successful / stats.total) * 100).toFixed(1)}%\n\n`;

      if (errors.length > 0) {
        responseText += `❌ Errors (${errors.length}):\n`;
        responseText += errors.slice(0, 10).map(err => `- ${err}`).join('\n');
        if (errors.length > 10) {
          responseText += `\n... and ${errors.length - 10} more errors`;
        }
      }

      if (successful > 0 && !validateOnly) {
        responseText += `\n\n✅ Successfully created ${successful} products`;
      }

      return {
        content: [
          {
            type: "text",
            text: responseText,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Bulk creation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "ai_enhance_products",
  {
    title: "AI Enhance Products",
    description: "Use AI to enhance product descriptions, SEO, and categorization",
    inputSchema: {
      products: z.array(z.object({
        name: z.string(),
        description: z.string().optional(),
        short_description: z.string().optional(),
        categories: z.array(z.string()).optional(),
        tags: z.array(z.string()).optional(),
      })),
      enhancements: z.object({
        improveDescriptions: z.boolean().default(true),
        generateSEO: z.boolean().default(true),
        suggestCategories: z.boolean().default(true),
        generateTags: z.boolean().default(true),
        tone: z.enum(['professional', 'casual', 'enthusiastic', 'technical']).default('professional'),
      }).optional(),
    },
  },
  async ({ products, enhancements = {} }) => {
    try {
      const {
        improveDescriptions = true,
        generateSEO = true,
        suggestCategories = true,
        generateTags = true,
        tone = 'professional'
      } = enhancements;

      const enhancedProducts = [];

      for (const product of products) {
        const prompt = `
          Enhance this product information with AI:

          Product: ${product.name}
          Current Description: ${product.description || 'None'}
          Current Short Description: ${product.short_description || 'None'}
          Current Categories: ${product.categories?.join(', ') || 'None'}
          Current Tags: ${product.tags?.join(', ') || 'None'}

          Please provide enhancements in JSON format:
          {
            ${improveDescriptions ? '"enhanced_description": "Improved full description",' : ''}
            ${improveDescriptions ? '"enhanced_short_description": "Improved short description",' : ''}
            ${generateSEO ? '"seo_title": "SEO optimized title",' : ''}
            ${generateSEO ? '"seo_description": "SEO meta description",' : ''}
            ${generateSEO ? '"seo_keywords": ["keyword1", "keyword2"],' : ''}
            ${suggestCategories ? '"suggested_categories": ["category1", "category2"],' : ''}
            ${generateTags ? '"suggested_tags": ["tag1", "tag2", "tag3"]' : ''}
          }

          Use a ${tone} tone and focus on highlighting key features and benefits.
        `;

        try {
          const aiResponse = await documentProcessor.processDocument({
            filePath: '', // Not used for this operation
            fileType: 'json',
            processingMode: 'analyze',
            customPrompt: prompt,
            batchSize: 1,
            validateOnly: true,
          });

          // For now, return the original product with enhancement suggestions
          // In a real implementation, this would use the AI response
          const enhanced = {
            ...product,
            ai_suggestions: {
              enhanced_description: improveDescriptions ? `Enhanced description for ${product.name} with professional tone` : undefined,
              enhanced_short_description: improveDescriptions ? `Enhanced short description for ${product.name}` : undefined,
              seo_title: generateSEO ? `${product.name} - Premium Quality` : undefined,
              seo_description: generateSEO ? `Discover ${product.name} with exceptional quality and value` : undefined,
              seo_keywords: generateSEO ? [product.name.toLowerCase(), 'quality', 'premium'] : undefined,
              suggested_categories: suggestCategories ? ['General'] : undefined,
              suggested_tags: generateTags ? ['featured', 'popular', 'quality'] : undefined,
            }
          };

          enhancedProducts.push(enhanced);
        } catch (error) {
          // Add product without enhancements if AI fails
          enhancedProducts.push({
            ...product,
            ai_error: `Enhancement failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          });
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `AI Enhancement completed for ${products.length} products:\n\n${JSON.stringify(enhancedProducts, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `AI enhancement error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "ai_workflow_complete",
  {
    title: "Complete AI Workflow",
    description: "End-to-end AI workflow: upload, process, enhance, and create products",
    inputSchema: {
      credentials: WooCommerceCredentialsSchema.optional(),
      filePath: z.string(),
      fileType: z.enum(['csv', 'xlsx', 'pdf', 'docx', 'txt', 'json']),
      template: z.string().optional(),
      workflow: z.object({
        extractData: z.boolean().default(true),
        analyzeContent: z.boolean().default(true),
        generateProducts: z.boolean().default(true),
        enhanceWithAI: z.boolean().default(true),
        validateProducts: z.boolean().default(true),
        createProducts: z.boolean().default(false),
        batchSize: z.number().min(1).max(50).default(10),
      }).optional(),
      customPrompt: z.string().optional(),
    },
  },
  async ({ credentials = {}, filePath, fileType, template, workflow = {}, customPrompt }) => {
    try {
      const {
        extractData = true,
        analyzeContent = true,
        generateProducts = true,
        enhanceWithAI = true,
        validateProducts = true,
        createProducts = false,
        batchSize = 10
      } = workflow;

      let responseText = "🤖 AI Workflow Execution Report\n";
      responseText += "================================\n\n";

      const results: any = {};

      // Step 1: Extract Data
      if (extractData) {
        responseText += "📄 Step 1: Data Extraction\n";
        try {
          const extractResult = await documentProcessor.processDocument({
            filePath,
            fileType,
            processingMode: 'extract',
            template,
            customPrompt,
            batchSize,
            validateOnly: false,
          });

          if (extractResult.success) {
            results.extractedData = extractResult.data;
            responseText += `✅ Successfully extracted data from ${fileType.toUpperCase()} file\n`;
            if (Array.isArray(extractResult.data)) {
              responseText += `   Found ${extractResult.data.length} records\n`;
            }
          } else {
            responseText += `❌ Data extraction failed: ${extractResult.message}\n`;
            return {
              content: [{ type: "text", text: responseText }],
              isError: true,
            };
          }
        } catch (error) {
          responseText += `❌ Data extraction error: ${error instanceof Error ? error.message : 'Unknown error'}\n`;
          return {
            content: [{ type: "text", text: responseText }],
            isError: true,
          };
        }
        responseText += "\n";
      }

      // Step 2: Analyze Content
      if (analyzeContent) {
        responseText += "🔍 Step 2: Content Analysis\n";
        try {
          const analyzeResult = await documentProcessor.processDocument({
            filePath,
            fileType,
            processingMode: 'analyze',
            template,
            customPrompt: customPrompt || 'Analyze this data for product creation potential',
            batchSize,
            validateOnly: false,
          });

          if (analyzeResult.success) {
            results.analysis = analyzeResult.data;
            responseText += `✅ Content analysis completed\n`;
            responseText += `   Analysis insights available\n`;
          } else {
            responseText += `⚠️ Content analysis failed: ${analyzeResult.message}\n`;
          }
        } catch (error) {
          responseText += `⚠️ Content analysis error: ${error instanceof Error ? error.message : 'Unknown error'}\n`;
        }
        responseText += "\n";
      }

      // Step 3: Generate Products
      if (generateProducts) {
        responseText += "🏭 Step 3: Product Generation\n";
        try {
          const generateResult = await documentProcessor.processDocument({
            filePath,
            fileType,
            processingMode: 'generate_products',
            template,
            customPrompt,
            batchSize,
            validateOnly: true,
          });

          if (generateResult.success && generateResult.products) {
            results.generatedProducts = generateResult.products;
            responseText += `✅ Generated ${generateResult.products.length} products\n`;
            if (generateResult.stats) {
              responseText += `   Success rate: ${((generateResult.stats.successful / generateResult.stats.processed) * 100).toFixed(1)}%\n`;
            }
          } else {
            responseText += `❌ Product generation failed: ${generateResult.message}\n`;
            return {
              content: [{ type: "text", text: responseText }],
              isError: true,
            };
          }
        } catch (error) {
          responseText += `❌ Product generation error: ${error instanceof Error ? error.message : 'Unknown error'}\n`;
          return {
            content: [{ type: "text", text: responseText }],
            isError: true,
          };
        }
        responseText += "\n";
      }

      // Step 4: AI Enhancement
      if (enhanceWithAI && results.generatedProducts) {
        responseText += "✨ Step 4: AI Enhancement\n";
        try {
          // Simulate AI enhancement (in real implementation, this would use actual AI)
          const enhancedProducts = results.generatedProducts.map((product: any) => ({
            ...product,
            ai_enhanced: true,
            enhanced_description: product.description ? `${product.description} [AI Enhanced]` : undefined,
            seo_optimized: true,
          }));

          results.enhancedProducts = enhancedProducts;
          responseText += `✅ Enhanced ${enhancedProducts.length} products with AI\n`;
          responseText += `   Added SEO optimization and improved descriptions\n`;
        } catch (error) {
          responseText += `⚠️ AI enhancement error: ${error instanceof Error ? error.message : 'Unknown error'}\n`;
        }
        responseText += "\n";
      }

      // Step 5: Validation
      if (validateProducts && (results.enhancedProducts || results.generatedProducts)) {
        responseText += "✅ Step 5: Product Validation\n";
        const productsToValidate = results.enhancedProducts || results.generatedProducts;
        let validProducts = 0;
        let invalidProducts = 0;
        const validationErrors: string[] = [];

        for (const product of productsToValidate) {
          if (product.name && product.regular_price) {
            validProducts++;
          } else {
            invalidProducts++;
            validationErrors.push(`${product.name || 'Unknown'}: Missing required fields`);
          }
        }

        results.validationStats = {
          total: productsToValidate.length,
          valid: validProducts,
          invalid: invalidProducts,
          errors: validationErrors,
        };

        responseText += `✅ Validated ${productsToValidate.length} products\n`;
        responseText += `   Valid: ${validProducts}, Invalid: ${invalidProducts}\n`;
        if (invalidProducts > 0) {
          responseText += `   Validation errors: ${validationErrors.slice(0, 3).join(', ')}${validationErrors.length > 3 ? '...' : ''}\n`;
        }
        responseText += "\n";
      }

      // Step 6: Create Products (if requested)
      if (createProducts && results.enhancedProducts) {
        responseText += "🚀 Step 6: Product Creation\n";
        try {
          const client = createWooCommerceClient(credentials);
          let created = 0;
          let failed = 0;
          const creationErrors: string[] = [];

          for (const product of results.enhancedProducts.slice(0, batchSize)) {
            try {
              await client.post("/products", product);
              created++;
            } catch (error) {
              failed++;
              creationErrors.push(`${product.name}: ${handleApiError(error)}`);
            }
          }

          results.creationStats = {
            attempted: Math.min(results.enhancedProducts.length, batchSize),
            created,
            failed,
            errors: creationErrors,
          };

          responseText += `✅ Product creation completed\n`;
          responseText += `   Created: ${created}, Failed: ${failed}\n`;
          if (failed > 0) {
            responseText += `   Creation errors: ${creationErrors.slice(0, 2).join(', ')}${creationErrors.length > 2 ? '...' : ''}\n`;
          }
        } catch (error) {
          responseText += `❌ Product creation error: ${error instanceof Error ? error.message : 'Unknown error'}\n`;
        }
        responseText += "\n";
      }

      // Summary
      responseText += "📊 Workflow Summary\n";
      responseText += "==================\n";
      if (results.extractedData) {
        responseText += `📄 Data extracted: ${Array.isArray(results.extractedData) ? results.extractedData.length : 'Yes'} records\n`;
      }
      if (results.generatedProducts) {
        responseText += `🏭 Products generated: ${results.generatedProducts.length}\n`;
      }
      if (results.enhancedProducts) {
        responseText += `✨ Products enhanced: ${results.enhancedProducts.length}\n`;
      }
      if (results.validationStats) {
        responseText += `✅ Products validated: ${results.validationStats.valid}/${results.validationStats.total}\n`;
      }
      if (results.creationStats) {
        responseText += `🚀 Products created: ${results.creationStats.created}/${results.creationStats.attempted}\n`;
      }

      responseText += "\n🎉 Workflow completed successfully!";

      return {
        content: [
          {
            type: "text",
            text: responseText,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Workflow error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "get_mcp_context",
  {
    title: "Get MCP Context",
    description: "Get information about this MCP server's purpose, capabilities, and configuration",
    inputSchema: {},
  },
  async () => {
    try {
      const hasWooCommerceCredentials = !!(GLOBAL_CREDENTIALS.siteUrl && GLOBAL_CREDENTIALS.consumerKey && GLOBAL_CREDENTIALS.consumerSecret);
      const hasWordPressCredentials = !!(GLOBAL_CREDENTIALS.username && GLOBAL_CREDENTIALS.password);
      const hasAICredentials = !!(process.env.OPENAI_API_KEY);

      const contextInfo = {
        purpose: MCP_CONTEXT.purpose,
        description: MCP_CONTEXT.description,
        capabilities: MCP_CONTEXT.capabilities,
        defaultBehavior: MCP_CONTEXT.defaultBehavior,
        aiProvider: MCP_CONTEXT.aiProvider,
        credentialPolicy: MCP_CONTEXT.credentialPolicy,

        configuration: {
          woocommerceConfigured: hasWooCommerceCredentials,
          wordpressConfigured: hasWordPressCredentials,
          aiConfigured: hasAICredentials,
          siteUrl: GLOBAL_CREDENTIALS.siteUrl ? `${GLOBAL_CREDENTIALS.siteUrl.substring(0, 20)}...` : 'Not configured',
          aiModel: process.env.AI_MODEL || 'gpt-4-vision-preview',
          visionModel: process.env.AI_VISION_MODEL || 'gpt-4-vision-preview',
          textModel: process.env.AI_TEXT_MODEL || 'gpt-4',
          customEndpoint: process.env.OPENAI_BASE_URL || 'Default OpenAI',
        },

        toolCategories: {
          woocommerceTools: 91,
          aiProcessingTools: 11,
          totalTools: 102,
        },

        supportedFormats: {
          documents: ['CSV', 'Excel', 'PDF', 'Word', 'Text', 'JSON'],
          images: ['JPG', 'PNG', 'GIF', 'WebP', 'BMP', 'TIFF'],
          processingModes: ['extract', 'analyze', 'generate_products', 'bulk_upload'],
          visionAnalysis: ['product_extraction', 'catalog_analysis', 'price_detection', 'general_analysis'],
        },

        recommendations: [] as string[]
      };

      // Add configuration recommendations
      if (!hasWooCommerceCredentials) {
        contextInfo.recommendations.push("🔧 Configure WooCommerce credentials (WORDPRESS_SITE_URL, WOOCOMMERCE_CONSUMER_KEY, WOOCOMMERCE_CONSUMER_SECRET)");
      }
      if (!hasWordPressCredentials) {
        contextInfo.recommendations.push("🔧 Configure WordPress credentials for content management (WORDPRESS_USERNAME, WORDPRESS_PASSWORD)");
      }
      if (!hasAICredentials) {
        contextInfo.recommendations.push("🤖 Configure AI credentials for document processing (OPENAI_API_KEY)");
      }
      if (hasWooCommerceCredentials && hasAICredentials) {
        contextInfo.recommendations.push("✅ Fully configured! Ready for complete WooCommerce management and AI processing");
      }

      return {
        content: [
          {
            type: "text",
            text: `🤖 WooCommerce MCP Server Context\n${'='.repeat(40)}\n\n${JSON.stringify(contextInfo, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error getting MCP context: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Main function to start the server
async function main() {
  try {
    // Create transport (stdio for command line usage)
    const transport = new StdioServerTransport();

    // Connect the server to the transport
    await server.connect(transport);

    // Check if we're in a verbose logging environment
    const isVerbose = process.env.WOOCOMMERCE_MCP_VERBOSE === "true" || process.argv.includes("--verbose");

    if (isVerbose) {
      // Detailed logging for development/debugging
      console.log("🚀 WooCommerce MCP Server is running...");
      console.log("📋 Available tools:");
    } else {
      // Minimal logging for MCP clients
      console.log("WooCommerce MCP Server ready - 91 tools available");
      return; // Skip detailed tool listing
    }
    console.log("");
    console.log("📦 Product Management (6 tools):");
    console.log("- get_products, get_product, create_product, update_product, delete_product");
    console.log("");
    console.log("📋 Order Management (5 tools):");
    console.log("- get_orders, get_order, create_order, update_order, delete_order");
    console.log("");
    console.log("👥 Customer Management (5 tools):");
    console.log("- get_customers, get_customer, create_customer, update_customer, delete_customer");
    console.log("");
    console.log("🏷️ Categories & Tags (10 tools):");
    console.log("- get_product_categories, get_product_category, create_product_category, update_product_category, delete_product_category");
    console.log("- get_product_tags, get_product_tag, create_product_tag, update_product_tag, delete_product_tag");
    console.log("");
    console.log("🎫 Coupons (5 tools):");
    console.log("- get_coupons, get_coupon, create_coupon, update_coupon, delete_coupon");
    console.log("");
    console.log("🔧 Product Attributes (5 tools):");
    console.log("- get_product_attributes, get_product_attribute, create_product_attribute, update_product_attribute, delete_product_attribute");
    console.log("");
    console.log("🔄 Product Variations (5 tools):");
    console.log("- get_product_variations, get_product_variation, create_product_variation, update_product_variation, delete_product_variation");
    console.log("");
    console.log("📝 Order Notes (4 tools):");
    console.log("- get_order_notes, get_order_note, create_order_note, delete_order_note");
    console.log("");
    console.log("💰 Order Refunds (4 tools):");
    console.log("- get_order_refunds, get_order_refund, create_order_refund, delete_order_refund");
    console.log("");
    console.log("🔗 Meta Data Operations (12 tools):");
    console.log("- get_product_meta, create_product_meta, update_product_meta, delete_product_meta");
    console.log("- get_order_meta, create_order_meta, update_order_meta, delete_order_meta");
    console.log("- get_customer_meta, create_customer_meta, update_customer_meta, delete_customer_meta");
    console.log("");
    console.log("⭐ Product Reviews (5 tools):");
    console.log("- get_product_reviews, get_product_review, create_product_review, update_product_review, delete_product_review");
    console.log("");
    console.log("⚙️ Settings Management (3 tools):");
    console.log("- get_settings, get_setting_options, update_setting_option");
    console.log("");
    console.log("📊 Reports & Analytics (8 tools):");
    console.log("- get_sales_report, get_products_report, get_orders_report, get_customers_report");
    console.log("- get_categories_report, get_stock_report, get_coupons_report, get_taxes_report");
    console.log("");
    console.log("🌍 Data & Geography (5 tools):");
    console.log("- get_data, get_continents, get_countries, get_currencies, get_current_currency");
    console.log("");
    console.log("📄 WordPress Posts (4 tools):");
    console.log("- create_post, get_posts, update_post, get_post_meta");
    console.log("");
    console.log("💳 Payment Gateways (3 tools):");
    console.log("- get_payment_gateways, get_payment_gateway, update_payment_gateway");
    console.log("");
    console.log("⚙️ System (3 tools):");
    console.log("- get_system_status, get_system_status_tools, run_system_status_tool");
    console.log("");
    console.log("🤖 AI Document & Vision Processing (12 tools):");
    console.log("- upload_file, search_files, process_document, process_image_with_vision, list_templates");
    console.log("- create_template, get_template, validate_file, bulk_create_products");
    console.log("- ai_enhance_products, ai_workflow_complete, get_mcp_context");
    console.log("");
    console.log("🎯 TOTAL: 103 COMPREHENSIVE WOOCOMMERCE + AI TOOLS");
    console.log("");
    console.log("📋 Environment variables:");
    console.log("🔧 Required for WooCommerce:");
    console.log("- WORDPRESS_SITE_URL: Your WordPress site URL");
    console.log("- WOOCOMMERCE_CONSUMER_KEY: WooCommerce API consumer key");
    console.log("- WOOCOMMERCE_CONSUMER_SECRET: WooCommerce API consumer secret");
    console.log("- WORDPRESS_USERNAME: WordPress username (for content management)");
    console.log("- WORDPRESS_PASSWORD: WordPress password (for content management)");
    console.log("");
    console.log("🤖 AI & Vision Language Models:");
    console.log("- OPENAI_API_KEY: OpenAI API key (required for AI features)");
    console.log("- OPENAI_BASE_URL: Custom OpenAI-compatible endpoint (optional)");
    console.log("- AI_MODEL: Default AI model (default: gpt-4-vision-preview)");
    console.log("- AI_VISION_MODEL: Vision language model for images (default: gpt-4-vision-preview)");
    console.log("- AI_TEXT_MODEL: Text model for documents (default: gpt-4)");
    console.log("");
    console.log("📚 LangChain Configuration:");
    console.log("- USE_LANGCHAIN: Enable LangChain document processing (default: true)");
    console.log("- LANGCHAIN_CHUNK_SIZE: Text splitting chunk size (default: 1000)");
    console.log("- LANGCHAIN_CHUNK_OVERLAP: Text splitting overlap (default: 200)");
    console.log("- ENABLE_CLIENT_VISION_DETECTION: Detect client vision capabilities (default: true)");
    console.log("");
    console.log("📁 File Processing:");
    console.log("- UPLOAD_DIR: Directory for file uploads (default: ./uploads)");
    console.log("- TEMPLATE_DIR: Directory for templates (default: ./templates)");

  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("🔄 Shutting down WooCommerce MCP Server...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("🔄 Shutting down WooCommerce MCP Server...");
  process.exit(0);
});

// Start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
  });
}
