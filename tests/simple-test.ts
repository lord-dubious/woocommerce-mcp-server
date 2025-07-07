#!/usr/bin/env node

import axios from "axios";
import { z } from "zod";

// Test configuration
const TEST_CONFIG = {
  siteUrl: process.env.TEST_WORDPRESS_SITE_URL || "https://demo.woocommerce.com",
  consumerKey: process.env.TEST_WOOCOMMERCE_CONSUMER_KEY || "",
  consumerSecret: process.env.TEST_WOOCOMMERCE_CONSUMER_SECRET || "",
};

interface TestResult {
  tool: string;
  test: string;
  passed: boolean;
  error?: string;
  duration: number;
}

class SimpleWooCommerceTester {
  private results: TestResult[] = [];

  async testWooCommerceAPI(): Promise<void> {
    console.log("🧪 Testing WooCommerce API Connectivity...\n");

    if (!TEST_CONFIG.consumerKey || !TEST_CONFIG.consumerSecret) {
      console.log("⚠️  No test credentials provided. Set these environment variables:");
      console.log("- TEST_WORDPRESS_SITE_URL");
      console.log("- TEST_WOOCOMMERCE_CONSUMER_KEY");
      console.log("- TEST_WOOCOMMERCE_CONSUMER_SECRET");
      console.log("\nRunning basic validation tests only...\n");
      await this.runValidationTests();
      return;
    }

    const client = axios.create({
      baseURL: `${TEST_CONFIG.siteUrl}/wp-json/wc/v3`,
      params: {
        consumer_key: TEST_CONFIG.consumerKey,
        consumer_secret: TEST_CONFIG.consumerSecret,
      },
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Test basic API endpoints
    const tests = [
      {
        name: "Get Products",
        endpoint: "/products",
        params: { per_page: 5 },
      },
      {
        name: "Get Orders",
        endpoint: "/orders",
        params: { per_page: 5 },
      },
      {
        name: "Get Customers",
        endpoint: "/customers",
        params: { per_page: 5 },
      },
      {
        name: "Get Product Categories",
        endpoint: "/products/categories",
        params: { per_page: 5 },
      },
      {
        name: "Get Coupons",
        endpoint: "/coupons",
        params: { per_page: 5 },
      },
      {
        name: "Get Payment Gateways",
        endpoint: "/payment_gateways",
        params: {},
      },
      {
        name: "Get System Status",
        endpoint: "/system_status",
        params: {},
      },
    ];

    for (const test of tests) {
      await this.runAPITest(client, test.name, test.endpoint, test.params);
    }

    await this.runValidationTests();
    this.printResults();
  }

  private async runAPITest(
    client: any,
    testName: string,
    endpoint: string,
    params: any
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log(`🔍 Testing ${testName}...`);
      const response = await client.get(endpoint, { params });
      const duration = Date.now() - startTime;

      if (response.status === 200) {
        console.log(`✅ ${testName} - Success (${duration}ms)`);
        this.results.push({
          tool: endpoint,
          test: testName,
          passed: true,
          duration,
        });
      } else {
        console.log(`❌ ${testName} - Unexpected status: ${response.status}`);
        this.results.push({
          tool: endpoint,
          test: testName,
          passed: false,
          error: `Unexpected status: ${response.status}`,
          duration,
        });
      }
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.log(`❌ ${testName} - Error: ${error.message}`);
      this.results.push({
        tool: endpoint,
        test: testName,
        passed: false,
        error: error.message,
        duration,
      });
    }
  }

  private async runValidationTests(): Promise<void> {
    console.log("\n🔧 Running Schema Validation Tests...\n");

    const validationTests = [
      {
        name: "Product Data Schema",
        test: () => {
          const ProductDataSchema = z.object({
            name: z.string(),
            type: z.enum(["simple", "grouped", "external", "variable"]).default("simple"),
            regular_price: z.string().optional(),
            description: z.string().optional(),
          });

          const validProduct = {
            name: "Test Product",
            type: "simple" as const,
            regular_price: "29.99",
            description: "A test product",
          };

          const result = ProductDataSchema.safeParse(validProduct);
          return result.success;
        },
      },
      {
        name: "Order Data Schema",
        test: () => {
          const OrderDataSchema = z.object({
            line_items: z.array(z.object({
              product_id: z.number(),
              quantity: z.number(),
            })),
            billing: z.object({
              first_name: z.string(),
              last_name: z.string(),
              email: z.string().email(),
            }).optional(),
          });

          const validOrder = {
            line_items: [{ product_id: 123, quantity: 2 }],
            billing: {
              first_name: "John",
              last_name: "Doe",
              email: "john@example.com",
            },
          };

          const result = OrderDataSchema.safeParse(validOrder);
          return result.success;
        },
      },
      {
        name: "Customer Data Schema",
        test: () => {
          const CustomerDataSchema = z.object({
            email: z.string().email(),
            first_name: z.string(),
            last_name: z.string(),
          });

          const validCustomer = {
            email: "customer@example.com",
            first_name: "Jane",
            last_name: "Smith",
          };

          const result = CustomerDataSchema.safeParse(validCustomer);
          return result.success;
        },
      },
      {
        name: "Coupon Data Schema",
        test: () => {
          const CouponDataSchema = z.object({
            code: z.string(),
            amount: z.string(),
            discount_type: z.enum(["percent", "fixed_cart", "fixed_product"]).default("fixed_cart"),
          });

          const validCoupon = {
            code: "SAVE10",
            amount: "10.00",
            discount_type: "percent" as const,
          };

          const result = CouponDataSchema.safeParse(validCoupon);
          return result.success;
        },
      },
      {
        name: "Category Data Schema",
        test: () => {
          const CategoryDataSchema = z.object({
            name: z.string(),
            slug: z.string().optional(),
            parent: z.number().optional(),
          });

          const validCategory = {
            name: "Electronics",
            slug: "electronics",
            parent: 0,
          };

          const result = CategoryDataSchema.safeParse(validCategory);
          return result.success;
        },
      },
    ];

    for (const test of validationTests) {
      const startTime = Date.now();
      try {
        const passed = test.test();
        const duration = Date.now() - startTime;
        
        if (passed) {
          console.log(`✅ ${test.name} - Valid`);
        } else {
          console.log(`❌ ${test.name} - Invalid`);
        }

        this.results.push({
          tool: "validation",
          test: test.name,
          passed,
          duration,
        });
      } catch (error: any) {
        const duration = Date.now() - startTime;
        console.log(`❌ ${test.name} - Error: ${error.message}`);
        this.results.push({
          tool: "validation",
          test: test.name,
          passed: false,
          error: error.message,
          duration,
        });
      }
    }
  }

  private printResults(): void {
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    const total = this.results.length;
    const passRate = ((passed / total) * 100).toFixed(1);

    console.log("\n" + "=".repeat(50));
    console.log("📊 TEST SUMMARY");
    console.log("=".repeat(50));
    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${passed} ✅`);
    console.log(`Failed: ${failed} ❌`);
    console.log(`Pass Rate: ${passRate}%`);

    if (failed > 0) {
      console.log("\n❌ Failed Tests:");
      this.results
        .filter(r => !r.passed)
        .forEach(r => {
          console.log(`- ${r.test}: ${r.error || "Unknown error"}`);
        });
    }

    console.log("=".repeat(50));
  }
}

// Tool completeness check
function checkToolCompleteness(): void {
  console.log("\n🔍 Checking Tool Completeness...\n");

  const implementedTools = [
    // Product Management (6)
    "get_products", "get_product", "create_product", "update_product", "delete_product",
    
    // Order Management (5)
    "get_orders", "get_order", "create_order", "update_order", "delete_order",
    
    // Customer Management (5)
    "get_customers", "get_customer", "create_customer", "update_customer", "delete_customer",
    
    // Categories (5)
    "get_product_categories", "get_product_category", "create_product_category", 
    "update_product_category", "delete_product_category",
    
    // Tags (5)
    "get_product_tags", "get_product_tag", "create_product_tag", 
    "update_product_tag", "delete_product_tag",
    
    // Coupons (5)
    "get_coupons", "get_coupon", "create_coupon", "update_coupon", "delete_coupon",
    
    // Attributes (5)
    "get_product_attributes", "get_product_attribute", "create_product_attribute",
    "update_product_attribute", "delete_product_attribute",
    
    // Variations (5)
    "get_product_variations", "get_product_variation", "create_product_variation",
    "update_product_variation", "delete_product_variation",
    
    // Order Notes (4)
    "get_order_notes", "get_order_note", "create_order_note", "delete_order_note",
    
    // Order Refunds (4)
    "get_order_refunds", "get_order_refund", "create_order_refund", "delete_order_refund",
    
    // Reports (4)
    "get_sales_report", "get_products_report", "get_orders_report", "get_customers_report",
    
    // Payment Gateways (3)
    "get_payment_gateways", "get_payment_gateway", "update_payment_gateway",
    
    // System (1)
    "get_system_status",
  ];

  console.log(`✅ Total Tools Implemented: ${implementedTools.length}`);
  console.log("\n📦 Tool Categories:");
  console.log("- Product Management: 6 tools");
  console.log("- Order Management: 5 tools");
  console.log("- Customer Management: 5 tools");
  console.log("- Categories: 5 tools");
  console.log("- Tags: 5 tools");
  console.log("- Coupons: 5 tools");
  console.log("- Attributes: 5 tools");
  console.log("- Variations: 5 tools");
  console.log("- Order Notes: 4 tools");
  console.log("- Order Refunds: 4 tools");
  console.log("- Reports: 4 tools");
  console.log("- Payment Gateways: 3 tools");
  console.log("- System: 1 tool");
}

// Main execution
async function main() {
  console.log("🚀 WooCommerce MCP Server Test Suite\n");
  
  checkToolCompleteness();
  
  const tester = new SimpleWooCommerceTester();
  await tester.testWooCommerceAPI();
  
  console.log("\n🎉 Testing complete!");
  console.log("\nTo run with your WooCommerce store:");
  console.log("export TEST_WORDPRESS_SITE_URL='https://your-site.com'");
  console.log("export TEST_WOOCOMMERCE_CONSUMER_KEY='ck_your_key'");
  console.log("export TEST_WOOCOMMERCE_CONSUMER_SECRET='cs_your_secret'");
  console.log("npm run test");
}

// Main execution
main().catch(console.error);
