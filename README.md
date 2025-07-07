# WooCommerce MCP Server

A Model Context Protocol (MCP) server for WooCommerce integration, providing AI agents and Claude with tools to manage WooCommerce stores.

## What Changed

This server has been completely rewritten to properly implement the MCP standard:

### Before (Issues)
- ❌ Custom JSON-RPC implementation instead of MCP SDK
- ❌ No proper MCP protocol support (initialization, capabilities, etc.)
- ❌ Custom readline-based transport
- ❌ Massive switch statement with 100+ cases
- ❌ No input validation or proper error handling
- ❌ Not compatible with MCP clients like Claude Desktop

### After (Fixed)
- ✅ Uses official MCP TypeScript SDK (`@modelcontextprotocol/sdk`)
- ✅ Proper MCP protocol implementation with capabilities
- ✅ Standard stdio transport for MCP clients
- ✅ Clean tool-based architecture with proper schemas
- ✅ Zod validation for all inputs
- ✅ Proper error handling and user-friendly responses
- ✅ Compatible with Claude Desktop and other MCP clients

## Features

### 📦 Product Management
- `get_products` - Retrieve products with filtering options
- `get_product` - Get specific product by ID
- `create_product` - Create new products
- `update_product` - Update existing products
- `delete_product` - Delete products

### 📋 Order Management
- `get_orders` - Retrieve orders with filtering
- `get_order` - Get specific order by ID
- `create_order` - Create new orders
- `update_order` - Update existing orders
- `delete_order` - Delete orders

### 👥 Customer Management
- `get_customers` - Retrieve customers
- `get_customer` - Get specific customer by ID
- `create_customer` - Create new customers
- `update_customer` - Update existing customers
- `delete_customer` - Delete customers

### 🏷️ Categories & Tags
- `get_product_categories` - Retrieve product categories
- `get_product_category` - Get specific category by ID
- `create_product_category` - Create new categories
- `update_product_category` - Update existing categories
- `delete_product_category` - Delete categories
- `get_product_tags` - Retrieve product tags
- `get_product_tag` - Get specific tag by ID
- `create_product_tag` - Create new tags
- `update_product_tag` - Update existing tags
- `delete_product_tag` - Delete tags

### 🎫 Coupon Management
- `get_coupons` - Retrieve coupons with filtering
- `get_coupon` - Get specific coupon by ID
- `create_coupon` - Create new coupons
- `update_coupon` - Update existing coupons
- `delete_coupon` - Delete coupons

### 🔧 Product Attributes
- `get_product_attributes` - Retrieve product attributes
- `get_product_attribute` - Get specific attribute by ID
- `create_product_attribute` - Create new attributes
- `update_product_attribute` - Update existing attributes
- `delete_product_attribute` - Delete attributes

### 🔄 Product Variations
- `get_product_variations` - Retrieve variations for variable products
- `get_product_variation` - Get specific variation by ID
- `create_product_variation` - Create new product variations
- `update_product_variation` - Update existing variations
- `delete_product_variation` - Delete variations

### 📝 Order Notes
- `get_order_notes` - Retrieve notes for orders
- `get_order_note` - Get specific order note
- `create_order_note` - Add notes to orders
- `delete_order_note` - Delete order notes

### 💰 Order Refunds
- `get_order_refunds` - Retrieve refunds for orders
- `get_order_refund` - Get specific refund details
- `create_order_refund` - Process order refunds
- `delete_order_refund` - Delete refunds

### 📊 Reports & Analytics
- `get_sales_report` - Get sales data and analytics
- `get_products_report` - Get products performance report
- `get_orders_report` - Get orders analytics report
- `get_customers_report` - Get customers analytics report

### 💳 Payment Gateways
- `get_payment_gateways` - Retrieve all payment gateways
- `get_payment_gateway` - Get specific payment gateway
- `update_payment_gateway` - Update payment gateway settings

### ⚙️ System Information
- `get_system_status` - Get WooCommerce system status and diagnostics

## Installation

1. Clone the repository:
```bash
git clone https://github.com/lord-dubious/woocommerce-mcp-server.git
cd woocommerce-mcp-server
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

## Configuration

Set up your environment variables in a `.env` file:

```env
# Required for WooCommerce API
WORDPRESS_SITE_URL=https://your-site.com
WOOCOMMERCE_CONSUMER_KEY=ck_your_consumer_key
WOOCOMMERCE_CONSUMER_SECRET=cs_your_consumer_secret

# Optional for WordPress API (if needed)
WORDPRESS_USERNAME=your_username
WORDPRESS_PASSWORD=your_password
```

### Getting WooCommerce API Keys

1. Go to your WordPress admin dashboard
2. Navigate to **WooCommerce > Settings > Advanced > REST API**
3. Click **Add Key**
4. Set permissions to **Read/Write**
5. Copy the Consumer Key and Consumer Secret

## Usage

### With Claude Desktop

Add to your Claude Desktop MCP configuration:

```json
{
  "mcpServers": {
    "woocommerce": {
      "command": "node",
      "args": ["/path/to/woocommerce-mcp-server/build/index.js"],
      "env": {
        "WORDPRESS_SITE_URL": "https://your-site.com",
        "WOOCOMMERCE_CONSUMER_KEY": "ck_your_key",
        "WOOCOMMERCE_CONSUMER_SECRET": "cs_your_secret"
      }
    }
  }
}
```

### Command Line Testing

You can test the server directly:

```bash
npm start
```

Then send MCP messages via stdin (for debugging).

### Example Usage in Claude

Once configured, you can ask Claude to:

- "Show me the latest 10 products from my WooCommerce store"
- "Create a new product called 'Test Product' with price $29.99"
- "Get the details of order #123"
- "Show me this month's sales report"
- "List all customers who signed up this week"
- "Create a 20% off coupon for electronics"
- "Add a note to order #456"
- "Process a refund for order #789"
- "Get all variations for product #123"

## Tool Parameters

### Credentials (Optional for all tools)
You can override environment variables per request:

```typescript
{
  credentials: {
    siteUrl: "https://different-site.com",
    consumerKey: "different_key",
    consumerSecret: "different_secret"
  }
}
```

### Product Tools
- **get_products**: `perPage`, `page`, `search`, `category`, `tag`, `featured`, `on_sale`, `min_price`, `max_price`, `stock_status`
- **get_product**: `productId`
- **create_product**: `productData` (name, type, regular_price, description, etc.)
- **update_product**: `productId`, `productData`
- **delete_product**: `productId`, `force`

### Order Tools
- **get_orders**: `perPage`, `page`, `search`, `after`, `before`, `status`, `customer`, `product`
- **get_order**: `orderId`
- **create_order**: `orderData` (billing, shipping, line_items, etc.)
- **update_order**: `orderId`, `orderData`
- **delete_order**: `orderId`, `force`

### Customer Tools
- **get_customers**: `perPage`, `page`, `search`, `email`, `role`
- **get_customer**: `customerId`
- **create_customer**: `customerData` (email, first_name, last_name, billing, shipping)
- **update_customer**: `customerId`, `customerData`
- **delete_customer**: `customerId`, `force`, `reassign`

### Category Tools
- **get_product_categories**: `perPage`, `page`, `search`, `parent`, `hide_empty`
- **get_product_category**: `categoryId`
- **create_product_category**: `categoryData` (name, slug, parent, description, etc.)
- **update_product_category**: `categoryId`, `categoryData`
- **delete_product_category**: `categoryId`, `force`

### Tag Tools
- **get_product_tags**: `perPage`, `page`, `search`, `hide_empty`
- **get_product_tag**: `tagId`
- **create_product_tag**: `tagData` (name, slug, description)
- **update_product_tag**: `tagId`, `tagData`
- **delete_product_tag**: `tagId`, `force`

### Coupon Tools
- **get_coupons**: `perPage`, `page`, `search`, `after`, `before`, `code`
- **get_coupon**: `couponId`
- **create_coupon**: `couponData` (code, amount, discount_type, etc.)
- **update_coupon**: `couponId`, `couponData`
- **delete_coupon**: `couponId`, `force`

### Attribute Tools
- **get_product_attributes**: `perPage`, `page`
- **get_product_attribute**: `attributeId`
- **create_product_attribute**: `attributeData` (name, slug, type, etc.)
- **update_product_attribute**: `attributeId`, `attributeData`
- **delete_product_attribute**: `attributeId`, `force`

### Report Tools
- **get_sales_report**: `period`, `date_min`, `date_max`
- **get_products_report**: `period`, `date_min`, `date_max`, `perPage`, `page`
- **get_orders_report**: `period`, `date_min`, `date_max`, `perPage`, `page`
- **get_customers_report**: `perPage`, `page`

### Payment Gateway Tools
- **get_payment_gateways**: No parameters
- **get_payment_gateway**: `gatewayId`
- **update_payment_gateway**: `gatewayId`, `gatewayData` (enabled, title, description, settings)

## Error Handling

The server provides detailed error messages for:
- Missing credentials
- Invalid API responses
- Network errors
- Validation errors

All errors are returned in a user-friendly format with context.

## Development

### Adding New Tools

1. Define input schema with Zod
2. Register tool with `server.registerTool()`
3. Implement async handler function
4. Add proper error handling
5. Update documentation

### Testing

The server includes a comprehensive testing system to validate all tools and functionality.

#### Quick Test (Schema Validation)
```bash
npm test
```
This runs basic schema validation tests without requiring WooCommerce credentials.

#### Full API Testing
```bash
# Set up test credentials
export TEST_WORDPRESS_SITE_URL='https://your-test-site.com'
export TEST_WOOCOMMERCE_CONSUMER_KEY='ck_your_test_key'
export TEST_WOOCOMMERCE_CONSUMER_SECRET='cs_your_test_secret'

# Run full API tests
npm run test
```

#### Advanced Testing
```bash
npm run test:full  # Run comprehensive MCP server tests
npm run validate   # Validate build and schemas only
```

#### Test Configuration
Copy `tests/test-config.example.env` to `.env` and configure your test credentials:

```env
TEST_WORDPRESS_SITE_URL=https://your-test-site.com
TEST_WOOCOMMERCE_CONSUMER_KEY=ck_your_test_key
TEST_WOOCOMMERCE_CONSUMER_SECRET=cs_your_test_secret
```

**⚠️ Important**: Always use a test/staging site, never your production store!

#### What Gets Tested
- ✅ All 56 WooCommerce tools
- ✅ Schema validation for all data types
- ✅ Error handling and edge cases
- ✅ API connectivity and authentication
- ✅ Response format validation
- ✅ Performance metrics

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## Support

For issues and questions:
- Open an issue on GitHub
- Check WooCommerce REST API documentation
- Review MCP specification

## Related Links

- [Model Context Protocol](https://modelcontextprotocol.io/)
- [WooCommerce REST API](https://woocommerce.github.io/woocommerce-rest-api-docs/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
