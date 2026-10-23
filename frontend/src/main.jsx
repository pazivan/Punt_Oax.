import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom' //Agregado el 21 oct 26 por Citlalli
//importa el enrutador y envuelve tu componente <App/>
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter> 
      <App />
    </BrowserRouter> 
  </StrictMode>,
)
