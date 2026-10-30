import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource-variable/fraunces';
import '@fontsource-variable/space-grotesk';
import './styles.css';
import App from './App.jsx';
import { PenyediaProfil, profilAwal, terapkanProfil } from './merek/ProfilContext.jsx';

// Profil diterapkan sebelum render pertama, supaya tidak ada kedipan warna bawaan.
const profil = profilAwal();
terapkanProfil(profil);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PenyediaProfil awal={profil}>
      <App />
    </PenyediaProfil>
  </StrictMode>,
);
