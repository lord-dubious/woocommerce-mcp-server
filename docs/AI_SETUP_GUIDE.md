# 🤖 AI Document Processing Setup Guide

This guide will help you set up and configure the AI document processing system with LangChain and Vision Language Models for the WooCommerce MCP server.

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [AI Service Configuration](#ai-service-configuration)
3. [Environment Setup](#environment-setup)
4. [Vision Language Models](#vision-language-models)
5. [LangChain Configuration](#langchain-configuration)
6. [Client Vision Detection](#client-vision-detection)
7. [Testing Your Setup](#testing-your-setup)
8. [Troubleshooting](#troubleshooting)

## 🔧 Prerequisites

- Node.js 18+ installed
- WooCommerce MCP server running
- OpenAI API key or OpenAI-compatible endpoint
- Sufficient disk space for file uploads (recommended: 1GB+)

## 🧠 AI Service Configuration

The system uses **Vision Language Models** with intelligent client detection:

### **Primary: OpenAI Vision Models**
- **Advantages**: True vision capabilities, reliable, latest models
- **Requirements**: OpenAI API key or compatible endpoint
- **Best for**: Image analysis, product extraction from catalogs

### **Alternative: Custom OpenAI-Compatible Endpoints**
- **Advantages**: Local deployment, privacy, cost control
- **Requirements**: Local vision model server with OpenAI API compatibility
- **Best for**: High-volume processing, sensitive data

### **Client Vision Detection**
- **Automatic detection** of client vision capabilities
- **Privacy-preserving** local processing when available
- **Intelligent routing** between client and server processing

## 🌍 Environment Setup

Create a `.env` file in your project root:

```env
# WooCommerce Configuration (Required)
WORDPRESS_SITE_URL=https://your-site.com
WOOCOMMERCE_CONSUMER_KEY=ck_your_consumer_key
WOOCOMMERCE_CONSUMER_SECRET=cs_your_consumer_secret
WORDPRESS_USERNAME=your_username
WORDPRESS_PASSWORD=your_password

# Vision Language Models (Required for AI features)
OPENAI_API_KEY=sk-your-openai-api-key        # OpenAI API key
OPENAI_BASE_URL=https://api.openai.com/v1    # Or custom endpoint

# AI Model Configuration
AI_MODEL=gpt-4-vision-preview                # Default vision model
AI_VISION_MODEL=gpt-4-vision-preview         # Vision model for images
AI_TEXT_MODEL=gpt-4                          # Text model for documents
AI_MAX_TOKENS=4000                           # Maximum tokens per request
AI_TEMPERATURE=0.7                           # AI creativity (0-2)

# LangChain Configuration
USE_LANGCHAIN=true                           # Enable LangChain processing
LANGCHAIN_CHUNK_SIZE=1000                    # Text chunk size
LANGCHAIN_CHUNK_OVERLAP=200                  # Chunk overlap
ENABLE_CLIENT_VISION_DETECTION=true          # Detect client capabilities

# File Processing Configuration
UPLOAD_DIR=./uploads                         # File upload directory
TEMPLATE_DIR=./templates                     # Template directory
MAX_FILE_SIZE=52428800                       # Max file size (50MB)

# Logging Configuration
WOOCOMMERCE_MCP_VERBOSE=true                # Enable verbose logging
```

## 👁️ Vision Language Models

### **OpenAI Setup**

1. Visit [OpenAI Platform](https://platform.openai.com/)
2. Create an account or sign in
3. Navigate to API Keys section
4. Create a new API key
5. Copy the key to your `.env` file

### **Custom Endpoint Setup**

For local or custom vision models:

```env
# Example: Local vision model server
OPENAI_BASE_URL=http://localhost:8000/v1
OPENAI_API_KEY=your-local-api-key
AI_VISION_MODEL=your-vision-model-name
```

### **Verify Vision Setup**

```bash
# Test OpenAI API (replace with your key)
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer sk-your-api-key"

# Test custom endpoint
curl http://localhost:8000/v1/models \
  -H "Authorization: Bearer your-local-key"
```

## 📚 LangChain Configuration

LangChain provides advanced document processing capabilities:

### **Features:**
- **Advanced document loaders** for PDF, DOCX, and text files
- **Intelligent text splitting** with configurable chunk sizes
- **Document chunking** for better AI processing
- **Fallback processing** when LangChain is unavailable

### **Configuration:**
```env
USE_LANGCHAIN=true                    # Enable LangChain
LANGCHAIN_CHUNK_SIZE=1000            # Text chunk size
LANGCHAIN_CHUNK_OVERLAP=200          # Overlap between chunks
```

## 🧠 Client Vision Detection

The system automatically detects if your client supports vision processing:

### **How it works:**
1. Client sends `clientCapabilities` with vision support info
2. System intelligently routes processing based on capabilities
3. Privacy-preserving local processing when possible
4. Graceful fallback to server processing

### **Client Capabilities Example:**
```typescript
{
  clientCapabilities: {
    supportsVision: true,
    visionModels: ["gpt-4-vision-preview"],
    preferClientVision: true
  }
}
```

### **Benefits:**
- **Privacy**: Images stay on client device
- **Performance**: No network transfer for large images
- **Flexibility**: Use client's preferred vision models

## 🧪 Testing Your Setup

### **1. Basic Server Test**

```bash
# Start the server
npm start

# Expected output: Server ready with 103 tools
```

### **2. AI Functionality Test**

```bash
# Run AI test suite
npm run test:ai

# Expected: 7/7 tests passing
```

### **3. Manual Tool Tests**

Use your MCP client to test these tools:

```typescript
// Test document processing with LangChain
process_document({
  filePath: "./examples/sample-products.csv",
  fileType: "csv",
  processingMode: "extract"
})

// Test vision processing with client detection
process_document({
  filePath: "./product-image.jpg",
  fileType: "image",
  processingMode: "analyze",
  clientCapabilities: {
    supportsVision: true,
    visionModels: ["gpt-4-vision-preview"],
    preferClientVision: true
  }
})

// Test template management
list_templates({})
```

## 🔧 Troubleshooting

### **Common Issues**

#### **OpenAI API Error**
```
Error: OpenAI API error: Invalid API key
```
**Solution**:
- Verify OPENAI_API_KEY in .env file
- Check API key permissions on OpenAI platform
- Ensure sufficient API credits

#### **Custom Endpoint Connection Failed**
```
Error: Vision model API error: Connection refused
```
**Solution**:
- Check if custom endpoint is running
- Verify OPENAI_BASE_URL in .env file
- Test endpoint with curl command

#### **LangChain Processing Failed**
```
Error: LangChain model not configured
```
**Solution**:
- Ensure OPENAI_API_KEY is set
- Verify USE_LANGCHAIN=true in .env
- Check document format is supported

#### **Client Vision Detection Not Working**
```
Processing always uses server vision
```
**Solution**:
- Ensure ENABLE_CLIENT_VISION_DETECTION=true
- Verify clientCapabilities are sent correctly
- Check client vision model compatibility

### **Performance Optimization**

#### **For High Volume Processing**
```env
# Increase processing limits
AI_MAX_TOKENS=8000
MAX_FILE_SIZE=104857600  # 100MB
LANGCHAIN_CHUNK_SIZE=2000
```

#### **For Memory Optimization**
```env
# Reduce processing limits
AI_MAX_TOKENS=2000
MAX_FILE_SIZE=26214400   # 25MB
LANGCHAIN_CHUNK_SIZE=500
```

## 📞 Support

If you encounter issues:

1. Check the [troubleshooting section](#troubleshooting)
2. Review server logs for detailed error messages
3. Test individual components (vision models, LangChain, client detection)
4. Verify environment configuration
5. Check API key permissions and credits

## 🎯 Next Steps

Once your setup is working:

1. **Explore Vision Processing**: Try image analysis with product catalogs
2. **Test Client Detection**: Configure client vision capabilities
3. **Create Custom Templates**: Build templates for your specific data formats
4. **Optimize Performance**: Tune AI parameters for your use case
5. **Scale Up**: Consider custom endpoints for high-volume processing

Happy AI-powered product management with Vision Language Models! 🚀
