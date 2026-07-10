import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { CapacitorUpdater } from '@capgo/capacitor-updater';

CapacitorUpdater.notifyAppReady();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
// g password "qgcc ahgd rmza onci"
// Deployment ID   AKfycbxag4w6_YKJTrdH7kv0PF4E__91TV12t6fsnmc7_GALSOUgHA_8EPtATNftCc0blSrLGQ
//web app    https://script.google.com/macros/s/AKfycbxag4w6_YKJTrdH7kv0PF4E__91TV12t6fsnmc7_GALSOUgHA_8EPtATNftCc0blSrLGQ/exec

//supabase secrets set CLOUDINARY_CLOUD_NAME="dfmi4udfs"
//supabase secrets set CLOUDINARY_API_KEY="262696519453518"
//supabase secrets set CLOUDINARY_API_SECRET="l7Ajx9sWW-kL3CBUr33g8ANlKsM"
//