#!/usr/bin/env node

/**
 * Advanced AI Workflow Example
 * 
 * This example demonstrates how to use the AI document processing system
 * to transform various document types into WooCommerce products.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Example workflow configurations
const workflows = {
  // CSV Product Import Workflow
  csvImport: {
    name: "CSV Product Import",
    description: "Import products from a CSV file with AI enhancement",
    steps: [
      {
        tool: "upload_file",
        params: {
          filePath: "./examples/sample-products.csv",
          originalName: "sample-products.csv"
        }
      },
      {
        tool: "process_document",
        params: {
          filePath: "./examples/sample-products.csv",
          fileType: "csv",
          processingMode: "generate_products",
          template: "ecommerce-csv",
          batchSize: 5
        }
      },
      {
        tool: "ai_enhance_products",
        params: {
          enhancements: {
            improveDescriptions: true,
            generateSEO: true,
            suggestCategories: true,
            generateTags: true,
            tone: "professional"
          }
        }
      },
      {
        tool: "bulk_create_products",
        params: {
          batchSize: 5,
          validateOnly: true // Set to false to actually create products
        }
      }
    ]
  },

  // PDF Catalog Processing Workflow
  pdfCatalog: {
    name: "PDF Catalog Processing",
    description: "Extract products from PDF catalogs using AI",
    steps: [
      {
        tool: "validate_file",
        params: {
          filePath: "./examples/product-catalog.pdf"
        }
      },
      {
        tool: "process_document",
        params: {
          filePath: "./examples/product-catalog.pdf",
          fileType: "pdf",
          processingMode: "extract"
        }
      },
      {
        tool: "process_document",
        params: {
          filePath: "./examples/product-catalog.pdf",
          fileType: "pdf",
          processingMode: "analyze",
          customPrompt: "Analyze this PDF catalog and identify product information including names, prices, descriptions, and categories"
        }
      },
      {
        tool: "process_document",
        params: {
          filePath: "./examples/product-catalog.pdf",
          fileType: "pdf",
          processingMode: "generate_products",
          customPrompt: "Extract product information from this catalog and create WooCommerce product data"
        }
      }
    ]
  },

  // Complete AI Workflow
  completeWorkflow: {
    name: "Complete AI Workflow",
    description: "End-to-end AI processing with all features",
    steps: [
      {
        tool: "ai_workflow_complete",
        params: {
          filePath: "./examples/sample-products.csv",
          fileType: "csv",
          template: "ecommerce-csv",
          workflow: {
            extractData: true,
            analyzeContent: true,
            generateProducts: true,
            enhanceWithAI: true,
            validateProducts: true,
            createProducts: false, // Set to true to actually create products
            batchSize: 10
          },
          customPrompt: "Process this product data with focus on creating high-quality, SEO-optimized product listings"
        }
      }
    ]
  },

  // Template Management Workflow
  templateManagement: {
    name: "Template Management",
    description: "Manage and customize product templates",
    steps: [
      {
        tool: "list_templates",
        params: {}
      },
      {
        tool: "get_template",
        params: {
          name: "ecommerce-csv"
        }
      },
      {
        tool: "create_template",
        params: {
          name: "custom-electronics",
          template: {
            name: "custom-electronics",
            description: "Custom template for electronics products",
            version: "1.0.0",
            fieldMappings: [
              {
                sourceField: "Product Name",
                targetField: "name",
                transform: "none",
                required: true
              },
              {
                sourceField: "Price",
                targetField: "regular_price",
                transform: "price",
                required: true
              },
              {
                sourceField: "Brand",
                targetField: "meta_data",
                transform: "none",
                required: false,
                defaultValue: "brand"
              }
            ],
            defaults: {
              type: "simple",
              status: "publish",
              catalog_visibility: "visible",
              manage_stock: true,
              stock_status: "instock",
              backorders: "no",
              sold_individually: false,
              reviews_allowed: true,
              menu_order: 0
            },
            validation: {
              requiredFields: ["name", "regular_price"],
              uniqueFields: ["sku"]
            }
          }
        }
      }
    ]
  },

  // File Management Workflow
  fileManagement: {
    name: "File Management",
    description: "Advanced file operations and search",
    steps: [
      {
        tool: "search_files",
        params: {
          directory: "./uploads",
          extensions: [".csv", ".xlsx", ".pdf"],
          recursive: true,
          pattern: "product"
        }
      },
      {
        tool: "validate_file",
        params: {
          filePath: "./examples/sample-products.csv"
        }
      }
    ]
  }
};

// Example usage functions
export async function runWorkflow(workflowName: keyof typeof workflows, mcpServer?: McpServer) {
  const workflow = workflows[workflowName];
  
  if (!workflow) {
    throw new Error(`Workflow '${workflowName}' not found`);
  }

  console.log(`🚀 Running workflow: ${workflow.name}`);
  console.log(`📝 Description: ${workflow.description}`);
  console.log(`🔧 Steps: ${workflow.steps.length}`);
  console.log("");

  const results = [];

  for (let i = 0; i < workflow.steps.length; i++) {
    const step = workflow.steps[i];
    console.log(`📍 Step ${i + 1}/${workflow.steps.length}: ${step.tool}`);
    
    try {
      // In a real implementation, you would call the MCP server here
      // const result = await mcpServer.callTool(step.tool, step.params);
      
      // For this example, we'll simulate the call
      const simulatedResult = {
        tool: step.tool,
        params: step.params,
        success: true,
        message: `Simulated execution of ${step.tool}`,
        timestamp: new Date().toISOString()
      };
      
      results.push(simulatedResult);
      console.log(`✅ Completed: ${step.tool}`);
    } catch (error) {
      console.log(`❌ Failed: ${step.tool} - ${error instanceof Error ? error.message : 'Unknown error'}`);
      results.push({
        tool: step.tool,
        params: step.params,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
    
    console.log("");
  }

  console.log("📊 Workflow Summary:");
  console.log(`- Total steps: ${workflow.steps.length}`);
  console.log(`- Successful: ${results.filter(r => r.success).length}`);
  console.log(`- Failed: ${results.filter(r => !r.success).length}`);
  console.log("");

  return results;
}

export function listAvailableWorkflows() {
  console.log("🔧 Available AI Workflows:");
  console.log("==========================");
  
  Object.entries(workflows).forEach(([key, workflow]) => {
    console.log(`\n📋 ${workflow.name} (${key})`);
    console.log(`   ${workflow.description}`);
    console.log(`   Steps: ${workflow.steps.length}`);
    console.log(`   Tools: ${workflow.steps.map(s => s.tool).join(', ')}`);
  });
  
  console.log("\n💡 Usage:");
  console.log("   runWorkflow('csvImport')");
  console.log("   runWorkflow('pdfCatalog')");
  console.log("   runWorkflow('completeWorkflow')");
  console.log("   runWorkflow('templateManagement')");
  console.log("   runWorkflow('fileManagement')");
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];
  const workflowName = process.argv[3] as keyof typeof workflows;

  switch (command) {
    case 'list':
      listAvailableWorkflows();
      break;
    case 'run':
      if (!workflowName || !workflows[workflowName]) {
        console.error("❌ Please specify a valid workflow name");
        console.log("Available workflows:", Object.keys(workflows).join(', '));
        process.exit(1);
      }
      runWorkflow(workflowName)
        .then(() => {
          console.log("🎉 Workflow completed successfully!");
        })
        .catch(error => {
          console.error("❌ Workflow failed:", error);
          process.exit(1);
        });
      break;
    default:
      console.log("🤖 AI Workflow Example");
      console.log("======================");
      console.log("");
      console.log("Commands:");
      console.log("  list                 - List available workflows");
      console.log("  run <workflow-name>  - Run a specific workflow");
      console.log("");
      console.log("Examples:");
      console.log("  node ai-workflow-example.js list");
      console.log("  node ai-workflow-example.js run csvImport");
      console.log("  node ai-workflow-example.js run completeWorkflow");
  }
}
