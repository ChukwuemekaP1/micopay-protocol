# Micopay: Plan de Compilación y Despliegue de Contratos (Para Claude)

Este documento detalla los pasos para compilar, optimizar y desplegar el contrato de Soroban (`escrow`) en la red de Stellar Testnet.

## 1. Requisitos del Entorno

Claude debe asegurarse de tener instalado lo siguiente:

- **Rust**: `v1.81` o superior.
- **WASM Target**: 
  ```bash
  rustup target add wasm32-unknown-unknown
  ```
- **Stellar CLI**: 
  ```bash
  cargo install --locked stellar-cli --features opt
  ```

---

## 2. Compilación del Contrato

Desde la raíz del proyecto (`micopay/contracts/escrow`):

1.  **Build**:
    ```bash
    stellar contract build
    ```
    *Esto generará un archivo `.wasm` en `target/wasm32-unknown-unknown/release/micopay_escrow.wasm`.*

2.  **Optimización (Crítico para Soroban)**:
    ```bash
    stellar contract optimize --wasm target/wasm32-unknown-unknown/release/micopay_escrow.wasm
    ```
    *Esto crea `micopay_escrow.optimized.wasm`, reduciendo drásticamente el tamaño y los costos de gas.*

---

## 3. Configuración de Red (Testnet)

Configurar la red SDF Testnet en la CLI:
```bash
stellar network add --rpc-url https://soroban-testnet.stellar.org:443 --network-passphrase "Test SDF Network ; September 2015" testnet
```

---

## 4. Identidad y Fondeo

Crear una identidad de administrador para el despliegue:
```bash
stellar keys generate deployer --network testnet
```
*Asegúrate de fondear esta cuenta usando el Friendbot de Stellar antes de continuar.*

---

## 5. Despliegue (Deploy)

Ejecutar el comando de despliegue para obtener el `CONTRACT_ID`:
```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/micopay_escrow.optimized.wasm \
  --source deployer \
  --network testnet
```

**IMPORTANTE**: Guarda el `Contract ID` (C...) que devuelve la CLI. Lo necesitarás para:
- `VITE_ESCROW_CONTRACT_ID` en el `.env` del Frontend.
- `ESCROW_CONTRACT_ID` en la configuración del Backend.

---

## 6. Verificación (Opcional)

Puedes inspeccionar la interfaz del contrato (Wasm Interface) para verificar que las funciones (`init`, `lock`, `release`) estén presentes:
```bash
stellar contract inspect --wasm target/wasm32-unknown-unknown/release/micopay_escrow.optimized.wasm
```
