# 📺 Aplicaciones Ultraligeras para Smart TVs (`tv-apps/`)

En esta carpeta se encuentran los archivos necesarios para empaquetar y publicar las apps oficiales de **envAIro TV Display** para televisores.

---

## 🟢 1. LG webOS (`tv-apps/lg-webos/`)
- **Archivos:** `appinfo.json`, `index.html`
- **Generar paquete `.ipk`:**
  ```bash
  ares-package tv-apps/lg-webos
  ```

---

## 🔵 2. Samsung Tizen (`tv-apps/samsung-tizen/`)
- **Archivos:** `config.xml`, `index.html`
- **Generar paquete `.wgt`:**
  Abre **Tizen Studio**, importa la carpeta `tv-apps/samsung-tizen/` y selecciona *Build Project*.

---

## 🤖 3. Android TV / Amazon Fire TV (`tv-apps/android-tv/`)
- **Archivos:** `AndroidManifest.xml`, `MainActivity.java`
- **Generar `.apk`:**
  Crea un nuevo proyecto en **Android Studio**, copia estos dos archivos y compila el APK firmado.

---

## 🌐 4. Acceso directo Web (Sin instalar nada)
- URL: `https://envairo.app/tv`
