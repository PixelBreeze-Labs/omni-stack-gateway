Product Import Methods Documentation
====================================

1\. Brand API Sync Integration
------------------------------

### Overview

Automatically sync products from official brand APIs (Swarovski, Blukids, etc.)

### Configuration

### Brand API Configuration
```http
{
  "name": "Swarovski",
  "baseUrl": "https://api.swarovski.com/v1",
  "apiKey": "sk_...",
  "endpoints": {
    "products": "/products",
    "inventory": "/inventory",
    "prices": "/prices"
  }
}
 ```

### Usage

```
POST 
/brands/{brandId}/sync  
Headers:     
x-client-api-key: YOUR_KEY  
 ```

### Process

1.  System fetches products from brand API
    
2.  Matches products by code/SKU
    
3.  Updates existing or creates new products
    
4.  Syncs prices and inventory
    
5.  Maintains external reference IDs
    

2\. Simple Product Import
-------------------------

### Overview

Basic CSV/Excel import with minimal required fields

### Template Format

```
code,barcode,name,initial_stock  
PRF001,123456,Product 1,10  
PRF002,234567,Product 2,15   `
```

### API

```http
POST /import/products  
Headers:    x-client-api-key: YOUR_KEY  
Content-Type: multipart/form-data  
Body:    file: products.csv    
type: simple   `
```

### Post-Import API Sync

```http
POST /products/{productId}/sync
```

Updates imported products with additional data from brand APIs.

3\. Warehouse Scanning
----------------------

### Overview

Mobile app scanning for inventory management

### Scan Process

1.  Scan product barcode
    
2.  Enter quantity
    
3.  Select warehouse location
    
4.  Submit scan
    

### API Endpoints

### Record Scan
```http
POST /scan/product
{
  "barcode": "123456",
  "warehouseId": "warehouse_id",
  "locationId": "location_id",
  "quantity": 10
}
```
### Get Scan History
```http
GET /scan/history
{
"warehouseId": "warehouse_id",
"startDate": "2025-01-01",
"endDate": "2025-01-31"
}
```

4\. Template-Based Import
-------------------------

### Template Types

#### A. Simple Template

- Basic product information.
- No variations.

```json
{
  "type": "simple",
  "mappings": {
    "required": ["code", "name", "barcode"],
    "optional": ["price", "description", "stock"]
  }
}
```

#### B. Variation Template
- Parent-child relationship.
- Multiple variations per product.

```json
{
  "type": "variation",
  "mappings": {
    "parent": ["code", "name"],
    "variation": ["sku", "size", "color", "price"]
  }
}
```

#### C. Matrix Template
- Generate variations from attribute matrix.

```json
{
  "type": "matrix",
  "attributes": {
    "size": ["S", "M", "L"],
    "color": ["Red", "Blue"]
  },
  "skuPattern": "BASE-{size}-{color}"
}
```

### API Usage

### Create and Use Template

#### Create Template
```http
POST /templates
{
  "name": "My Template",
  "type": "matrix",
  "mappings": {...}
}

```

### Use Template
```http
POST /templates/{id}/import
Content-Type: multipart/form-data
- file: products.xlsx
```

Implementation Examples
-----------------------

### 1. Brand API Sync

```typescript
// Example brand sync implementation
const brandProducts = await fetchBrandProducts(brandId);
for (const product of brandProducts) {
    await syncProduct(product);
}
```

### 2. Matrix Import Example
```typescript
// Generate variations from matrix
const variations = generateMatrix({
  base: "SHIRT-",
  attributes: {
    size: ["S", "M", "L"],
    color: ["Red", "Blue"]
  }
});
// Results in: SHIRT-S-RED, SHIRT-M-RED, etc.
```

### 3\. Scan Processing
```typescript
async function processScan(scanData) {
  const product = await findByBarcode(scanData.barcode);
  await updateInventory(product.id, scanData.quantity);
  await createScanLog(scanData);
}
