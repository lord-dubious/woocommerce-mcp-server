#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import axios from "axios";
import { WooMetaData } from "./types.js";

// Environment variables for WooCommerce/WordPress credentials
const DEFAULT_SITE_URL = process.env.WORDPRESS_SITE_URL || "";
const DEFAULT_USERNAME = process.env.WORDPRESS_USERNAME || "";
const DEFAULT_PASSWORD = process.env.WORDPRESS_PASSWORD || "";
const DEFAULT_CONSUMER_KEY = process.env.WOOCOMMERCE_CONSUMER_KEY || "";
const DEFAULT_CONSUMER_SECRET = process.env.WOOCOMMERCE_CONSUMER_SECRET || "";

// Validation schemas
const WooCommerceCredentialsSchema = z.object({
  siteUrl: z.string().url().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  consumerKey: z.string().optional(),
  consumerSecret: z.string().optional(),
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
function createWooCommerceClient(credentials: z.infer<typeof WooCommerceCredentialsSchema>) {
  const siteUrl = credentials.siteUrl || DEFAULT_SITE_URL;
  const consumerKey = credentials.consumerKey || DEFAULT_CONSUMER_KEY;
  const consumerSecret = credentials.consumerSecret || DEFAULT_CONSUMER_SECRET;

  if (!siteUrl) {
    throw new Error("WordPress site URL not provided in environment variables or parameters");
  }

  if (!consumerKey || !consumerSecret) {
    throw new Error("WooCommerce API credentials not provided in environment variables or parameters");
  }

  return axios.create({
    baseURL: `${siteUrl}/wp-json/wc/v3`,
    params: {
      consumer_key: consumerKey,
      consumer_secret: consumerSecret,
    },
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function createWordPressClient(credentials: z.infer<typeof WooCommerceCredentialsSchema>) {
  const siteUrl = credentials.siteUrl || DEFAULT_SITE_URL;
  const username = credentials.username || DEFAULT_USERNAME;
  const password = credentials.password || DEFAULT_PASSWORD;

  if (!siteUrl) {
    throw new Error("WordPress site URL not provided in environment variables or parameters");
  }

  if (!username || !password) {
    throw new Error("WordPress credentials not provided in environment variables or parameters");
  }

  const auth = Buffer.from(`${username}:${password}`).toString("base64");
  return axios.create({
    baseURL: `${siteUrl}/wp-json/wp/v2`,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
  });
}

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

// Main function to start the server
async function main() {
  try {
    // Create transport (stdio for command line usage)
    const transport = new StdioServerTransport();

    // Connect the server to the transport
    await server.connect(transport);

    // Log that the server is running (to stderr so it doesn't interfere with stdio)
    console.error("WooCommerce MCP Server is running...");
    console.error("Available tools:");
    console.error("");
    console.error("📦 Product Management:");
    console.error("- get_products, get_product, create_product, update_product, delete_product");
    console.error("");
    console.error("📋 Order Management:");
    console.error("- get_orders, get_order, create_order, update_order, delete_order");
    console.error("");
    console.error("👥 Customer Management:");
    console.error("- get_customers, get_customer, create_customer, update_customer, delete_customer");
    console.error("");
    console.error("🏷️ Categories & Tags:");
    console.error("- get_product_categories, get_product_category, create_product_category, update_product_category, delete_product_category");
    console.error("- get_product_tags, get_product_tag, create_product_tag, update_product_tag, delete_product_tag");
    console.error("");
    console.error("🎫 Coupons:");
    console.error("- get_coupons, get_coupon, create_coupon, update_coupon, delete_coupon");
    console.error("");
    console.error("🔧 Product Attributes:");
    console.error("- get_product_attributes, get_product_attribute, create_product_attribute, update_product_attribute, delete_product_attribute");
    console.error("");
    console.error("📊 Reports & Analytics:");
    console.error("- get_sales_report, get_products_report, get_orders_report, get_customers_report");
    console.error("");
    console.error("💳 Payment Gateways:");
    console.error("- get_payment_gateways, get_payment_gateway, update_payment_gateway");
    console.error("");
    console.error("⚙️ System:");
    console.error("- get_system_status");
    console.error("");
    console.error("Environment variables:");
    console.error("- WORDPRESS_SITE_URL: Your WordPress site URL");
    console.error("- WOOCOMMERCE_CONSUMER_KEY: WooCommerce API consumer key");
    console.error("- WOOCOMMERCE_CONSUMER_SECRET: WooCommerce API consumer secret");
    console.error("- WORDPRESS_USERNAME: WordPress username (for WordPress API)");
    console.error("- WORDPRESS_PASSWORD: WordPress password (for WordPress API)");

  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.error("Shutting down WooCommerce MCP Server...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.error("Shutting down WooCommerce MCP Server...");
  process.exit(0);
});

// Start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
  });
}
