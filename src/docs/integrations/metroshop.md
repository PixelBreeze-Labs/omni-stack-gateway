# MetroShop Integration (ByBest Duty Free)

## Overview
MetroShop is the ecommerce platform for ByBest Duty Free. ByBest has an account on BookMaster for accounting and inventory management.

## Entity Relationships
- Legal Entity: ByBest Duty Free
- BookMaster Account: ByBest (`client_id`)
- Ecommerce Platform: MetroShop

## Data Flow
```mermaid
graph TB
    MetroShop[MetroShop Platform] --> Gateway[Gateway Service]
    Gateway --> BookMaster[BookMaster Account<br/>(ByBest)]
    subgraph Inventory & Accounting
        BookMaster
    end
    subgraph Ecommerce
        MetroShop
    end