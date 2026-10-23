import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate', // อัปเดตแอปอัตโนมัติเมื่อมีเวอร์ชันใหม่
      manifest: {
        name: 'My Wallet App',
        short_name: 'MyWallet',
        description: 'ระบบบัญชีรายรับ-รายจ่ายส่วนบุคคล',
        theme_color: '#1e1e1e',
        background_color: '#121212',
        display: 'standalone', // ทำให้หน้าจอเหมือนแอปจริง (ซ่อนแถบเบราว์เซอร์)
        icons: [
          {
            src: '/icon.png', // ชื่อไฟล์รูปไอคอนแอป
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ]
})