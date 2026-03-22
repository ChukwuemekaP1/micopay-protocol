# Micopay: Plan de Integración Frontend-Stellar Escrow (Para Claude)

Este documento detalla los pasos técnicos para conectar los componentes de React recientemente creados con el backend de Stellar/Soroban.

## 1. Arquitectura de Conexión

El frontend no hablará directamente con el contrato de Soroban para operaciones críticas; usará el backend como orquestador para garantizar seguridad y persistencia en Base de Datos.

- **Frontend**: Maneja la UI, captura el monto y solicita la firma del usuario (Freighter/Stellar Wallet).
- **Backend**: Genera el XDR (transacción sin firmar), interactúa con Soroban y monitorea el estado del Ledger.
- **Stellar Network**: Ejecuta el contrato de Escrow y liquida los saldos en USDC/MXNE.

---

## 2. Configuración del Entorno (Frontend)

Claude debe instalar las dependencias necesarias:
```bash
npm install @stellar/stellar-sdk axios @stellar/wallet-adapter-kit
```

### Variables de Entorno `.env`:
```env
VITE_STELLAR_NETWORK=TESTNET
VITE_BACKEND_URL=https://tu-backend-api.com
VITE_ESCROW_CONTRACT_ID=C... (ID del contrato Soroban)
```

---

## 3. Implementación de Servicios

### A. Capa de API (`api.ts`)
Crear un cliente de Axios centralizado para todas las peticiones al backend:
- `POST /trades/create`: Inicia una intención de intercambio.
- `POST /escrow/init`: Solicita al backend el XDR para crear el escrow en Soroban.

### B. Capa de Soroban (`stellar.ts`)
Implementar funciones para interactuar con la billetera del usuario:
- `signTransaction(xdr: string)`: Usa Freighter para firmar el XDR enviado por el backend.
- `getPublicKey()`: Obtiene la dirección de la billetera conectada.

---

## 4. Integración en los Flujos de Usuario

### Flujo de Cash Out (Retiro)
1.  **Request (`CashoutRequest.tsx`)**: Al hacer clic en "Buscar Ofertas", llamar a `POST /trades/create`.
2.  **Selección (`ExploreMap.tsx`)**: Al aceptar un agente, el backend prepara el contrato de Escrow.
3.  **Firma (`QRReveal.tsx`)**: Antes de mostrar el QR, el sistema debe disparar la firma de la transacción Stellar para bloquear los fondos del usuario en el Escrow.
    - Llamar a `GET /escrow/xdr-create`.
    - Firmar con Freighter.
    - Enviar XDR firmado a `POST /escrow/submit`.

### Flujo de Deposit (Depósito)
1.  **Request (`DepositRequest.tsx`)**: Similar al retiro.
2.  **Agente Actúa**: El Agente es quien crea el Escrow. El usuario solo recibe la notificación.
3.  **Confirmación (`DepositQR.tsx`)**: Al ingresar el PIN, el frontend avisa al backend que el efectivo fue entregado. El backend entonces ejecuta el `release-escrow` en Soroban.

---

## 5. Gestión de Estado y Feedback

- **Loading States**: Los botones de "Aceptar" y "Confirmar PIN" deben mostrar un spinner mientras se procesa la transacción en el Ledger (3-5 segundos).
- **Polling para Éxito**: En la pantalla de `SuccessScreen.tsx`, implementar un pequeño polling al backend para verificar que el evento de Soroban se haya emitido antes de mostrar el balance actualizado.

---

## 6. Siguientes Pasos para Claude

1.  Implementar el **Wallet Connector** en la `Home.tsx` o en un Header global.
2.  Crear los hooks personalizados `useStellar` y `useEscrow` para encapsular la lógica de firma.
3.  Asegurar que los errores de la red Stellar (ej. falta de saldo o timeout) se muestren con el estilo de alertas de **Emerald Horizon**.
