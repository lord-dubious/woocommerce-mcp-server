#!/usr/bin/env node

import { spawn } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

interface TestCase {
  name: string;
  tool: string;
  params: any;
  expectedFields?: string[];
  shouldFail?: boolean;
  description: string;
}

interface TestResult {
  name: string;
  tool: string;
  passed: boolean;
  error?: string;
  response?: any;
  duration: number;
}

class WooCommerceMCPTester {
  private serverProcess: any;
  private testResults: TestResult[] = [];
  private credentials: any;

  constructor() {
    // Load test credentials from environment or config
    this.credentials = {
      siteUrl: process.env.TEST_WORDPRESS_SITE_URL || "https://demo.woocommerce.com",
      consumerKey: process.env.TEST_WOOCOMMERCE_CONSUMER_KEY || "",
      consumerSecret: process.env.TEST_WOOCOMMERCE_CONSUMER_SECRET || "",
      username: process.env.TEST_WORDPRESS_USERNAME || "",
      password: process.env.TEST_WORDPRESS_PASSWORD || "",
    };
  }

  async startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log("🚀 Starting WooCommerce MCP Server...");
      
      this.serverProcess = spawn("node", ["build/index.js"], {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          WORDPRESS_SITE_URL: this.credentials.siteUrl,
          WOOCOMMERCE_CONSUMER_KEY: this.credentials.consumerKey,
          WOOCOMMERCE_CONSUMER_SECRET: this.credentials.consumerSecret,
          WORDPRESS_USERNAME: this.credentials.username,
          WORDPRESS_PASSWORD: this.credentials.password,
        },
      });

      this.serverProcess.stderr.on("data", (data: Buffer) => {
        const message = data.toString();
        if (message.includes("WooCommerce MCP Server is running")) {
          console.log("✅ Server started successfully");
          resolve();
        }
      });

      this.serverProcess.on("error", (error: Error) => {
        console.error("❌ Failed to start server:", error);
        reject(error);
      });

      // Give the server a moment to start
      setTimeout(() => {
        if (!this.serverProcess.killed) {
          resolve();
        }
      }, 2000);
    });
  }

  async stopServer(): Promise<void> {
    if (this.serverProcess) {
      this.serverProcess.kill();
      console.log("🛑 Server stopped");
    }
  }

  async sendMCPRequest(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const request = {
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {
          name: method,
          arguments: params,
        },
      };

      let responseData = "";
      let errorData = "";

      const timeout = setTimeout(() => {
        reject(new Error("Request timeout"));
      }, 30000);

      this.serverProcess.stdout.on("data", (data: Buffer) => {
        responseData += data.toString();
        try {
          const response = JSON.parse(responseData.trim());
          clearTimeout(timeout);
          resolve(response);
        } catch (e) {
          // Continue collecting data
        }
      });

      this.serverProcess.stderr.on("data", (data: Buffer) => {
        errorData += data.toString();
      });

      // Send the request
      this.serverProcess.stdin.write(JSON.stringify(request) + "\n");
    });
  }

  async runTest(testCase: TestCase): Promise<TestResult> {
    const startTime = Date.now();
    console.log(`🧪 Testing ${testCase.tool}: ${testCase.name}`);

    try {
      const response = await this.sendMCPRequest(testCase.tool, testCase.params);
      const duration = Date.now() - startTime;

      if (testCase.shouldFail) {
        // Test should have failed but didn't
        return {
          name: testCase.name,
          tool: testCase.tool,
          passed: false,
          error: "Expected test to fail but it succeeded",
          response,
          duration,
        };
      }

      // Check if response has expected fields
      if (testCase.expectedFields) {
        const missing = testCase.expectedFields.filter(field => {
          return !this.hasField(response, field);
        });

        if (missing.length > 0) {
          return {
            name: testCase.name,
            tool: testCase.tool,
            passed: false,
            error: `Missing expected fields: ${missing.join(", ")}`,
            response,
            duration,
          };
        }
      }

      // Check for error in response
      if (response.error) {
        return {
          name: testCase.name,
          tool: testCase.tool,
          passed: false,
          error: response.error.message || "Unknown error",
          response,
          duration,
        };
      }

      return {
        name: testCase.name,
        tool: testCase.tool,
        passed: true,
        response,
        duration,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      if (testCase.shouldFail) {
        // Test was expected to fail
        return {
          name: testCase.name,
          tool: testCase.tool,
          passed: true,
          duration,
        };
      }

      return {
        name: testCase.name,
        tool: testCase.tool,
        passed: false,
        error: error instanceof Error ? error.message : String(error),
        duration,
      };
    }
  }

  private hasField(obj: any, field: string): boolean {
    const parts = field.split(".");
    let current = obj;
    
    for (const part of parts) {
      if (current === null || current === undefined || !(part in current)) {
        return false;
      }
      current = current[part];
    }
    
    return true;
  }

  async runAllTests(): Promise<void> {
    const testCases = this.getTestCases();
    
    console.log(`\n🎯 Running ${testCases.length} tests...\n`);

    for (const testCase of testCases) {
      const result = await this.runTest(testCase);
      this.testResults.push(result);

      if (result.passed) {
        console.log(`✅ ${result.name} (${result.duration}ms)`);
      } else {
        console.log(`❌ ${result.name} (${result.duration}ms)`);
        if (result.error) {
          console.log(`   Error: ${result.error}`);
        }
      }

      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.generateReport();
  }

  private getTestCases(): TestCase[] {
    return [
      // Product Management Tests
      {
        name: "Get Products - Basic",
        tool: "get_products",
        params: { perPage: 5 },
        expectedFields: ["content.0.type"],
        description: "Test basic product retrieval",
      },
      {
        name: "Get Products - With Search",
        tool: "get_products",
        params: { search: "test", perPage: 3 },
        expectedFields: ["content.0.type"],
        description: "Test product search functionality",
      },
      {
        name: "Get Product - Invalid ID",
        tool: "get_product",
        params: { productId: 999999 },
        shouldFail: true,
        description: "Test error handling for invalid product ID",
      },

      // Order Management Tests
      {
        name: "Get Orders - Basic",
        tool: "get_orders",
        params: { perPage: 5 },
        expectedFields: ["content.0.type"],
        description: "Test basic order retrieval",
      },
      {
        name: "Get Orders - With Status Filter",
        tool: "get_orders",
        params: { status: "completed", perPage: 3 },
        expectedFields: ["content.0.type"],
        description: "Test order filtering by status",
      },

      // Customer Management Tests
      {
        name: "Get Customers - Basic",
        tool: "get_customers",
        params: { perPage: 5 },
        expectedFields: ["content.0.type"],
        description: "Test basic customer retrieval",
      },

      // Category Management Tests
      {
        name: "Get Product Categories - Basic",
        tool: "get_product_categories",
        params: { perPage: 5 },
        expectedFields: ["content.0.type"],
        description: "Test category retrieval",
      },

      // Tag Management Tests
      {
        name: "Get Product Tags - Basic",
        tool: "get_product_tags",
        params: { perPage: 5 },
        expectedFields: ["content.0.type"],
        description: "Test tag retrieval",
      },

      // Coupon Management Tests
      {
        name: "Get Coupons - Basic",
        tool: "get_coupons",
        params: { perPage: 5 },
        expectedFields: ["content.0.type"],
        description: "Test coupon retrieval",
      },

      // Attribute Management Tests
      {
        name: "Get Product Attributes - Basic",
        tool: "get_product_attributes",
        params: { perPage: 5 },
        expectedFields: ["content.0.type"],
        description: "Test attribute retrieval",
      },

      // Reports Tests
      {
        name: "Get Sales Report - Basic",
        tool: "get_sales_report",
        params: { period: "month" },
        expectedFields: ["content.0.type"],
        description: "Test sales report generation",
      },
      {
        name: "Get Products Report - Basic",
        tool: "get_products_report",
        params: { period: "month", perPage: 5 },
        expectedFields: ["content.0.type"],
        description: "Test products report generation",
      },

      // Payment Gateway Tests
      {
        name: "Get Payment Gateways - Basic",
        tool: "get_payment_gateways",
        params: {},
        expectedFields: ["content.0.type"],
        description: "Test payment gateway retrieval",
      },

      // System Status Tests
      {
        name: "Get System Status - Basic",
        tool: "get_system_status",
        params: {},
        expectedFields: ["content.0.type"],
        description: "Test system status retrieval",
      },

      // Error Handling Tests
      {
        name: "Invalid Credentials Test",
        tool: "get_products",
        params: {
          credentials: {
            siteUrl: "https://invalid-site.com",
            consumerKey: "invalid",
            consumerSecret: "invalid",
          },
        },
        shouldFail: true,
        description: "Test error handling with invalid credentials",
      },
    ];
  }

  private generateReport(): void {
    const passed = this.testResults.filter(r => r.passed).length;
    const failed = this.testResults.filter(r => !r.passed).length;
    const total = this.testResults.length;
    const passRate = ((passed / total) * 100).toFixed(1);

    console.log("\n" + "=".repeat(60));
    console.log("📊 TEST RESULTS SUMMARY");
    console.log("=".repeat(60));
    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${passed} ✅`);
    console.log(`Failed: ${failed} ❌`);
    console.log(`Pass Rate: ${passRate}%`);
    console.log("=".repeat(60));

    if (failed > 0) {
      console.log("\n❌ FAILED TESTS:");
      this.testResults
        .filter(r => !r.passed)
        .forEach(r => {
          console.log(`- ${r.tool}: ${r.name}`);
          if (r.error) {
            console.log(`  Error: ${r.error}`);
          }
        });
    }

    // Save detailed report to file
    const report = {
      summary: {
        total,
        passed,
        failed,
        passRate: parseFloat(passRate),
        timestamp: new Date().toISOString(),
      },
      results: this.testResults,
    };

    writeFileSync("test-results.json", JSON.stringify(report, null, 2));
    console.log("\n📄 Detailed report saved to test-results.json");
  }
}

// Main execution
async function main() {
  const tester = new WooCommerceMCPTester();

  try {
    await tester.startServer();
    await tester.runAllTests();
  } catch (error) {
    console.error("❌ Test execution failed:", error);
    process.exit(1);
  } finally {
    await tester.stopServer();
  }
}

// Main execution
main().catch(console.error);

export { WooCommerceMCPTester };
