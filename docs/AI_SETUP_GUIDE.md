# 🤖 AI Document Processing Setup Guide

This guide will help you set up and configure the AI document processing system for the WooCommerce MCP server.

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [AI Service Configuration](#ai-service-configuration)
3. [Environment Setup](#environment-setup)
4. [vLLM Setup](#vllm-setup)
5. [OpenAI Setup](#openai-setup)
6. [File System Configuration](#file-system-configuration)
7. [Template Configuration](#template-configuration)
8. [Testing Your Setup](#testing-your-setup)
9. [Troubleshooting](#troubleshooting)

## 🔧 Prerequisites

- Node.js 18+ installed
- WooCommerce MCP server running
- At least one AI service configured (vLLM or OpenAI)
- Sufficient disk space for file uploads (recommended: 1GB+)

## 🧠 AI Service Configuration

The system supports two AI providers:

### **Primary: vLLM (Local AI)**
- **Advantages**: Privacy, no API costs, full control
- **Requirements**: GPU with sufficient VRAM, local server setup
- **Best for**: High-volume processing, sensitive data

### **Fallback: OpenAI (Cloud AI)**
- **Advantages**: No local setup, reliable, latest models
- **Requirements**: OpenAI API key, internet connection
- **Best for**: Quick setup, occasional use

## 🌍 Environment Setup

Create a `.env` file in your project root:

```env
# WooCommerce Configuration (Required)
WORDPRESS_SITE_URL=https://your-site.com
WOOCOMMERCE_CONSUMER_KEY=ck_your_consumer_key
WOOCOMMERCE_CONSUMER_SECRET=cs_your_consumer_secret
WORDPRESS_USERNAME=your_username
WORDPRESS_PASSWORD=your_password

# AI Configuration (Choose one or both)
VLLM_ENDPOINT=http://localhost:8000          # vLLM server endpoint
OPENAI_API_KEY=sk-your-openai-api-key        # OpenAI API key

# AI Model Configuration
AI_MODEL=gpt-4                               # Model to use (gpt-4, gpt-3.5-turbo, etc.)
AI_MAX_TOKENS=4000                           # Maximum tokens per request
AI_TEMPERATURE=0.7                           # AI creativity (0-2)

# File Processing Configuration
UPLOAD_DIR=./uploads                         # File upload directory
TEMPLATE_DIR=./templates                     # Template directory
MAX_FILE_SIZE=52428800                       # Max file size (50MB)

# Logging Configuration
WOOCOMMERCE_MCP_VERBOSE=true                # Enable verbose logging
```

## 🚀 vLLM Setup

### **Option 1: Docker Setup (Recommended)**

```bash
# Pull vLLM Docker image
docker pull vllm/vllm-openai:latest

# Run vLLM server with a model (example: Llama 2 7B)
docker run --gpus all \
  -v ~/.cache/huggingface:/root/.cache/huggingface \
  -p 8000:8000 \
  --ipc=host \
  vllm/vllm-openai:latest \
  --model meta-llama/Llama-2-7b-chat-hf \
  --served-model-name llama2 \
  --host 0.0.0.0 \
  --port 8000
```

### **Option 2: Local Installation**

```bash
# Install vLLM
pip install vllm

# Start vLLM server
python -m vllm.entrypoints.openai.api_server \
  --model meta-llama/Llama-2-7b-chat-hf \
  --host 0.0.0.0 \
  --port 8000
```

### **Verify vLLM Setup**

```bash
# Test vLLM endpoint
curl http://localhost:8000/v1/models

# Expected response: List of available models
```

## 🔑 OpenAI Setup

### **Get API Key**

1. Visit [OpenAI Platform](https://platform.openai.com/)
2. Create an account or sign in
3. Navigate to API Keys section
4. Create a new API key
5. Copy the key to your `.env` file

### **Verify OpenAI Setup**

```bash
# Test OpenAI API (replace with your key)
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer sk-your-api-key"

# Expected response: List of available models
```

## 📁 File System Configuration

### **Create Required Directories**

```bash
# Create upload and template directories
mkdir -p uploads templates

# Set appropriate permissions
chmod 755 uploads templates
```

### **Directory Structure**

```
project-root/
├── uploads/           # File uploads
│   ├── csv/          # CSV files
│   ├── excel/        # Excel files
│   ├── pdf/          # PDF files
│   └── processed/    # Processed files
├── templates/        # Product templates
│   ├── basic-product.json
│   ├── ecommerce-csv.json
│   ├── inventory-management.json
│   └── digital-product.json
└── examples/         # Example files
    ├── sample-products.csv
    └── custom-template.json
```

## 📋 Template Configuration

### **Default Templates**

The system includes 4 pre-built templates:

1. **basic-product** - Simple CSV imports
2. **ecommerce-csv** - Standard e-commerce exports
3. **inventory-management** - Inventory system integration
4. **digital-product** - Downloads and digital goods

### **Custom Template Creation**

```typescript
// Example custom template
{
  "name": "my-custom-template",
  "description": "Custom template for my products",
  "fieldMappings": [
    {
      "sourceField": "Product Name",
      "targetField": "name",
      "transform": "none",
      "required": true
    },
    {
      "sourceField": "Price",
      "targetField": "regular_price",
      "transform": "price",
      "required": true
    }
  ],
  "defaults": {
    "type": "simple",
    "status": "publish",
    "manage_stock": true
  },
  "validation": {
    "requiredFields": ["name", "regular_price"],
    "uniqueFields": ["sku"]
  }
}
```

## 🧪 Testing Your Setup

### **1. Basic Server Test**

```bash
# Start the server
npm start

# Expected output: Server ready with 101 tools
```

### **2. AI Functionality Test**

```bash
# Run AI test suite
npm run test:ai

# Expected: 7/7 tests passing
```

### **3. Manual Tool Test**

Use your MCP client to test these tools:

```typescript
// Test file upload
upload_file({
  filePath: "./examples/sample-products.csv",
  originalName: "test-products.csv"
})

// Test document processing
process_document({
  filePath: "./examples/sample-products.csv",
  fileType: "csv",
  processingMode: "extract"
})

// Test template listing
list_templates({})
```

## 🔧 Troubleshooting

### **Common Issues**

#### **vLLM Connection Failed**
```
Error: vLLM API error: Connection refused
```
**Solution**: 
- Check if vLLM server is running: `curl http://localhost:8000/health`
- Verify VLLM_ENDPOINT in .env file
- Check firewall settings

#### **OpenAI API Error**
```
Error: OpenAI API error: Invalid API key
```
**Solution**:
- Verify OPENAI_API_KEY in .env file
- Check API key permissions on OpenAI platform
- Ensure sufficient API credits

#### **File Upload Failed**
```
Error: File too large (max 50MB)
```
**Solution**:
- Increase MAX_FILE_SIZE in .env
- Check available disk space
- Verify file permissions

#### **Template Not Found**
```
Error: Template not found: my-template
```
**Solution**:
- Check template exists in templates directory
- Verify template name spelling
- Use `list_templates` to see available templates

### **Performance Optimization**

#### **For High Volume Processing**
```env
# Increase batch sizes
AI_MAX_TOKENS=8000
MAX_FILE_SIZE=104857600  # 100MB

# Use local vLLM for better performance
VLLM_ENDPOINT=http://localhost:8000
```

#### **For Memory Optimization**
```env
# Reduce batch sizes
AI_MAX_TOKENS=2000
MAX_FILE_SIZE=26214400   # 25MB
```

## 📞 Support

If you encounter issues:

1. Check the [troubleshooting section](#troubleshooting)
2. Review server logs for detailed error messages
3. Test individual components (AI service, file operations, templates)
4. Verify environment configuration
5. Check file permissions and disk space

## 🎯 Next Steps

Once your setup is working:

1. **Explore Workflows**: Try the example workflows in `examples/ai-workflow-example.ts`
2. **Create Custom Templates**: Build templates for your specific data formats
3. **Optimize Performance**: Tune AI parameters for your use case
4. **Scale Up**: Consider GPU upgrades for high-volume processing

Happy AI-powered product management! 🚀
