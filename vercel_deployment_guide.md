# Micopay: Guía de Despliegue en Vercel

Esta guía detalla cómo desplegar el MVP de Micopay para que sea accesible públicamente durante el hackatón.

## 1. Despliegue del Frontend (Vercel)

Vercel es la plataforma ideal para aplicaciones Vite/React.

### Pasos:
1.  **Conectar GitHub**: Ve a [Vercel](https://vercel.com) y crea un nuevo proyecto conectando tu repositorio `micopay-mvp`.
2.  **Configuración del Directorio**:
    - **Root Directory**: `micopay/frontend` (Muy importante: no selecciones la raíz del repo).
3.  **Configuración de Build**:
    - **Framework Preset**: Vite.
    - **Build Command**: `npm run build`.
    - **Output Directory**: `dist`.
4.  **Variables de Entorno**: Agrega las siguientes en la sección "Environment Variables":
    - `VITE_API_URL`: La URL de tu backend desplegado (ej. `https://micopay-api.render.com`).
    - `VITE_ESCROW_CONTRACT_ID`: El ID del contrato que despliegues en Testnet.

---

## 2. Despliegue del Backend

El backend está construido con Fastify (Node.js). Tienes dos opciones principales:

### Opción A: Render.com (Recomendada para Fastify)
Render es más sencillo para servidores persistentes como Fastify y ofrece bases de datos integradas.

#### 1. Crear la Base de Datos (PostgreSQL)
Antes del servidor, necesitas la base de datos:
1.  En Render, ve a **New** -> **PostgreSQL**.
2.  Ponle un nombre (ej. `micopay-db`).
3.  Una vez creada, copia la **Internal Database URL** (la necesitarás en el siguiente paso).

#### 2. Crear el Web Service (Backend)
1.  En Render, ve a **New** -> **Web Service**.
2.  Conecta tu GitHub y selecciona el repo `micopay-mvp`.
3.  **Configuración**:
    - **Name**: `micopay-api`.
    - **Root Directory**: `micopay/backend`.
    - **Build Command**: `npm install && npm run build`.
    - **Start Command**: `npm start`.
4.  **Variables de Entorno** (sección `Environment`):
    - `DATABASE_URL`: Pega la URL que copiaste de la base de datos.
    - `JWT_SECRET`: (Cualquier frase secreta larga).
    - `SECRET_ENCRYPTION_KEY`: (Una clave de 32 caracteres para el escrow).
    - `PLATFORM_SECRET_KEY`: (Tu clave privada de Stellar para fondear fees).
    - `NODE_ENV`: `production`.

**Copia la URL de este Web Service** (ej. `https://micopay-api.onrender.com`).

### Opción B: Vercel (Serverless)
Si prefieres mantener todo en Vercel, debes adaptar el backend:
1.  Crea un archivo `vercel.json` en `micopay/backend/`:
    ```json
    {
      "rewrites": [{ "source": "/(.*)", "destination": "src/index.ts" }]
    }
    ```
2.  Asegúrate de que `app.listen` sea condicional (Vercel maneja el puerto automáticamente).

---

## 3. Configuración de CORS

**IMPORTANTE**: Para que el frontend pueda hablar con el backend, asegúrate de que el backend permita el dominio de Vercel. 
- En `micopay/backend/src/index.ts`, ya configuramos `fastifyCors` con `origin: true`. Esto permitirá que cualquier dominio (incluyendo el de Vercel) haga peticiones, lo cual es perfecto para el MVP del hackatón.

---

## 4. Resumen de URLs Finales

Una vez desplegado, tendrás:
- **Frontend URL**: `https://micopay-mvp.vercel.app`
- **Backend URL**: `https://micopay-api.render.com` (o similar)

> [!TIP]
> Si haces cambios en la rama `main`, Vercel y Render redesplegarán automáticamente las aplicaciones.
