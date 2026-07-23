# 📺 Paquetes de Aplicación Ultraligeros para Smart TVs (`tv-app/`)

Este directorio contiene los paquetes y manifiestos ultraligeros diseñados para publicar la app de **envAIro TV Display** en las tiendas oficiales de Smart TVs o instalarla manualmente.

---

## 🟢 1. LG webOS (`tv-app/lg-webos/`)
- **Archivos incluídos:** `appinfo.json`, `index.html`
- **Tamaño aproximado:** ~5 KB
- **Cómo empaquetar:**
  1. Instala el CLI de LG webOS (`npm install -g @webosose/ares-cli`).
  2. Ejecuta `ares-package tv-app/lg-webos` para generar el archivo instalable `.ipk`.
  3. Puedes subir este `.ipk` al **LG Content Store** o instalarlo directamente en TVs con Developer Mode.

---

## 🔵 2. Samsung Tizen (`tv-app/samsung-tizen/`)
- **Archivos incluídos:** `config.xml`, `index.html`
- **Tamaño aproximado:** ~5 KB
- **Cómo empaquetar:**
  1. Descarga el **Tizen Studio** oficial de Samsung.
  2. Importa la carpeta `tv-app/samsung-tizen/` como proyecto Web App.
  3. Firma el paquete `.wgt` con la Samsung Certificate Manager.
  4. Sube el `.wgt` a **Samsung Seller Office** para su publicación en el App Store de televisores Samsung.

---

## 🤖 3. Android TV / Amazon Fire TV (`tv-app/android-tv/`)
- **Archivos incluídos:** `AndroidManifest.xml`, `MainActivity.java`
- **Tamaño aproximado del APK:** ~1.5 MB
- **Cómo empaquetar:**
  1. Crea un proyecto nuevo en **Android Studio** (o usa Capacitor: `npx cap add android`).
  2. Copia `AndroidManifest.xml` y `MainActivity.java`.
  3. Genera el APK firmado desde Android Studio (`Build > Generate Signed Bundle / APK`).
  4. Sube el APK a la **Google Play Store (Android TV)** o la **Amazon Appstore (Fire TV)**.

---

## 🌐 4. Método Universal PWA / Navegador (Sin tiendas)
Si el usuario no desea instalar nada desde las tiendas:
1. En la Smart TV, abre el navegador nativo y entra a: `https://envairo.app/tv`
2. Presiona "Agregar a la Pantalla de Inicio" o guardar en Favoritos/Marcadores.
