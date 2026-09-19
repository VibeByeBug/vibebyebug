import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AudienceScreen } from './components/AudienceScreen'

// 주소 뒤에 ?audience=1 이면 프로젝터용 청중 화면만 띄운다
const audience = new URLSearchParams(location.search).has('audience')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {audience ? <AudienceScreen /> : <App />}
  </StrictMode>,
)
