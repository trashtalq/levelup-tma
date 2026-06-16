import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// ── Инициализация Telegram Mini App ──────────────────────────────────────────
const tg = window.Telegram?.WebApp

if (tg) {
  // Раскрываем на весь экран
  tg.expand()
  // Убираем кнопку "Закрыть" в хедере (опционально)
  tg.setHeaderColor('#080d08')
  tg.setBackgroundColor('#080d08')
  // Говорим TG что приложение готово
  tg.ready()
}

// ── Экспортируем tg для использования в компонентах ──────────────────────────
export { tg }

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
