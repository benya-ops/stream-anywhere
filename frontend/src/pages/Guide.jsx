import { useState } from "react";
import { PageHeader } from "@/components/common";
import { PrimaryButton, GhostButton } from "@/components/Modal";
import { Download, Printer, BookOpen, Shield, User, Server } from "lucide-react";

// ---- Guide content (structured so we can render + export the same source) ----
const INSTALL = [
  { h: "1. Требования к серверу", b: [
    "Linux (Ubuntu 22.04/24.04 рекомендуется), root-доступ (sudo).",
    "Минимум 2 CPU / 4 ГБ RAM для 1–2 каналов; для нескольких HD-каналов — 4+ CPU / 8+ ГБ. Для GPU-транскодирования — NVIDIA GPU с драйверами (NVENC) или Intel/AMD для QSV/VAAPI.",
    "Открытые порты: 80 (веб-панель), 1935 (RTMP-приём), 9000–9010/udp (SRT-приём).",
  ]},
  { h: "2. Установка одной командой", b: [
    "Скопируйте проект на сервер (git clone вашего репозитория или загрузка архива) в папку, например /opt/stream-anywhere.",
    "code:cd /opt/stream-anywhere\nsudo bash deploy/install.sh",
    "Скрипт сам установит Docker, сгенерирует секреты и пароль администратора, подберёт лимиты CPU/RAM под сервер, откроет порты и поднимет весь стек (MongoDB + FFmpeg-движок + веб-панель).",
    "По завершении вы увидите адрес панели и логин/пароль администратора.",
  ]},
  { h: "3. Первый вход", b: [
    "Откройте в браузере http://<IP-вашего-сервера>/ (именно IP сервера, не localhost с другого ПК, без https, если не настроен TLS).",
    "Логин: admin@streamanywhere.io. Пароль: возьмите из файла деплоя.",
    "code:grep ADMIN_PASSWORD deploy/.env",
  ]},
  { h: "4. Обслуживание", b: [
    "Посмотреть статус контейнеров:",
    "code:docker ps",
    "Логи бэкенда (при проблемах):",
    "code:docker compose -f deploy/docker-compose.yml logs --tail=100 backend",
    "Перезапустить / остановить / обновить:",
    "code:docker compose -f deploy/docker-compose.yml restart\ndocker compose -f deploy/docker-compose.yml down\n# после обновления кода (git pull):\ndocker compose -f deploy/docker-compose.yml up -d --build",
    "Данные (MongoDB) и записи HLS хранятся в docker-томах и переживают перезапуск/обновление.",
    "Резервная копия базы:",
    "code:docker exec deploy-mongo-1 mongodump --archive > backup-$(date +%F).archive",
  ]},
  { h: "5. Смена пароля администратора", b: [
    "Отредактируйте ADMIN_PASSWORD в deploy/.env и перезапустите бэкенд — пароль синхронизируется в БД при старте:",
    "code:nano deploy/.env   # изменить ADMIN_PASSWORD=...\ndocker compose -f deploy/docker-compose.yml up -d backend",
  ]},
];

const ADMIN = [
  { h: "Роли и доступы (Access Control)", b: [
    "Один супер-администратор управляет всем. Саморегистрации и сброса пароля по email нет — это сделано намеренно для безопасности вещательного сервера.",
    "В разделе «Access Control» создавайте пользователей и выдавайте им доступ только к нужным модулям: engine, streams, sources, transcoding, media, analytics, system.",
    "Пользователь с ролью user видит только выданные ему модули; админ видит всё, включая «Presets» и «Access Control».",
  ]},
  { h: "Пресеты (Presets) — гибкая настройка без «зашитых» значений", b: [
    "Раздел «Presets» (только админ) задаёт ВСЕ выпадающие списки в приложении: частоты кадров, разрешения, регионы, протоколы доставки, ABR-лесенки и значения по умолчанию.",
    "Частоты кадров: добавляйте/удаляйте любые (25, 50, 30, 60, 24, 23.976, 29.97, 59.94). То, что здесь указано, появляется в выборе при создании стримов и каналов.",
    "ABR-лесенки: каждая строка — «высота,видео_кбит,аудио_кбит». Например 1080,6000,128. Эти лесенки использует реальный движок при транскодировании.",
    "Значения по умолчанию: частота кадров, лесенка, интервал ключевого кадра (сек) и длина HLS-сегмента (сек) для новых каналов/стримов.",
    "Кнопка «Save Presets» применяет изменения ко всему приложению немедленно; «Reset» возвращает заводские значения.",
  ]},
  { h: "Кодеки и аппаратное ускорение", b: [
    "Доступные видео/аудио кодеки и ускорители (NVENC/QSV/VAAPI) определяются автоматически из FFmpeg на вашем сервере — нельзя выбрать то, чего нет в системе.",
    "Поддерживаются в т.ч. H.264, H.265/HEVC, AV1, VP9, MPEG-2 (видео) и AAC, MP2, Opus, MP3, AC-3 (аудио) — при наличии в сборке FFmpeg.",
    "Проверить набор кодеков и ускорителей можно на странице «Media Server» (индикатор FFMPEG ONLINE).",
  ]},
  { h: "Медиасервер и защита сервера", b: [
    "На «Media Server» создаются реальные каналы транскодирования: источник (тест/бары/URL/SRT-приём/RTMP-приём), кодеки, частота кадров, лесенка, DVR и push-выход.",
    "Resource guard не даст запустить новый энкодер при перегрузке CPU или превышении лимита энкодеров — это защищает сервер от падения.",
    "Кнопка «Save Recording → VOD» сохраняет запись канала (DVR) в библиотеку VOD; можно выгрузить в S3 в разделе System.",
  ]},
];

const USER = [
  { h: "Создание живого стрима", b: [
    "Откройте «Live Streams» → «New Stream».",
    "Укажите имя, источник, профиль транскодирования, разрешение, частоту кадров (например 50 или 25) и регион. Списки берутся из пресетов, заданных администратором.",
    "Нажмите «Create Stream». Стрим появится в таблице со статусом.",
  ]},
  { h: "Управление и редактирование", b: [
    "Кнопки в строке стрима: ▷ запустить, ◻ остановить, ↻ failover (переключение на резерв), 👁 предпросмотр.",
    "✎ (Edit) открывает форму редактирования — можно изменить имя, разрешение, частоту кадров и т.д. и сохранить.",
    "🗑 удаляет стрим.",
  ]},
  { h: "Реальный транскодер (Media Server)", b: [
    "«Media Server» → «New Channel»: выберите источник, кодеки, частоту кадров и лесенку. Транскодер умеет конвертировать частоту (например 25→30, 50→60 и обратно).",
    "Нажмите «Start Encoder» — через несколько секунд появится живое HLS-видео прямо в браузере.",
    "Включите DVR, чтобы перематывать и сохранять записи в VOD.",
  ]},
  { h: "VOD и плейлисты", b: [
    "«VOD & Playout» — библиотека записей и плейлисты для playout-эфира.",
    "Импортируйте готовые файлы или сохраняйте записи каналов из Media Server.",
  ]},
];

const TABS = [
  { key: "install", label: "Установка и обслуживание", icon: Server, data: INSTALL },
  { key: "admin", label: "Гайд администратора", icon: Shield, data: ADMIN },
  { key: "user", label: "Гайд пользователя", icon: User, data: USER },
];

function buildMarkdown() {
  const sec = (title, data) =>
    `\n\n# ${title}\n` +
    data.map((s) => `\n## ${s.h}\n` + s.b.map((line) =>
      line.startsWith("code:") ? "\n```\n" + line.slice(5) + "\n```\n" : `- ${line}`
    ).join("\n")).join("\n");
  return `Stream Anywhere — Руководство` +
    sec("Установка и обслуживание", INSTALL) +
    sec("Гайд администратора", ADMIN) +
    sec("Гайд пользователя", USER) + "\n";
}

export default function Guide() {
  const [tab, setTab] = useState("install");
  const active = TABS.find((t) => t.key === tab);

  const downloadMd = () => {
    const blob = new Blob([buildMarkdown()], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "Stream-Anywhere-Guide.md"; a.click();
    URL.revokeObjectURL(url);
  };

  const openPrintable = () => {
    const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const renderData = (data) => data.map((s) =>
      `<h2>${esc(s.h)}</h2>` + s.b.map((line) =>
        line.startsWith("code:")
          ? `<pre>${esc(line.slice(5))}</pre>`
          : `<p>• ${esc(line)}</p>`
      ).join("")).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Stream Anywhere — Руководство</title>
      <style>body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:800px;margin:40px auto;color:#111;line-height:1.5;padding:0 20px}
      h1{border-bottom:3px solid #0ea5e9;padding-bottom:8px} h2{color:#0369a1;margin-top:24px}
      pre{background:#0f172a;color:#7dd3fc;padding:12px;border-radius:8px;overflow:auto;white-space:pre-wrap} p{margin:6px 0}</style></head><body>
      <h1>Stream Anywhere — Руководство</h1>
      <h1>Установка и обслуживание</h1>${renderData(INSTALL)}
      <h1>Гайд администратора</h1>${renderData(ADMIN)}
      <h1>Гайд пользователя</h1>${renderData(USER)}
      </body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html); w.document.close();
    setTimeout(() => w.print(), 400);
  };

  return (
    <div className="space-y-6" data-testid="guide-page">
      <PageHeader title="Guide" subtitle="Пошаговые инструкции: установка, обслуживание, администрирование и работа пользователя.">
        <div className="flex gap-2">
          <GhostButton testid="guide-download" onClick={downloadMd}><span className="flex items-center gap-1.5"><Download className="h-4 w-4" /> Скачать .md</span></GhostButton>
          <PrimaryButton testid="guide-print" onClick={openPrintable}><span className="flex items-center gap-1.5"><Printer className="h-4 w-4" /> PDF / Печать</span></PrimaryButton>
        </div>
      </PageHeader>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.key} data-testid={`guide-tab-${t.key}`} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key ? "border-sky-500/50 bg-sky-500/10 text-sky-300" : "border-[#1E293B] bg-[#0F172A]/60 text-slate-400 hover:text-slate-200"
            }`}>
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {active.data.map((s, i) => (
          <div key={i} className="rounded-lg border border-[#1E293B] bg-[#0F172A]/80 p-5" data-testid={`guide-section-${i}`}>
            <div className="mb-3 flex items-center gap-2">
              <div className="rounded-md border border-[#1E293B] bg-slate-950/50 p-2 text-sky-400"><BookOpen className="h-4 w-4" /></div>
              <h3 className="font-display text-base font-semibold text-slate-100">{s.h}</h3>
            </div>
            <div className="space-y-2">
              {s.b.map((line, j) =>
                line.startsWith("code:") ? (
                  <pre key={j} className="overflow-x-auto rounded-lg border border-[#1E293B] bg-slate-950/70 p-3 font-mono text-xs text-emerald-400 whitespace-pre-wrap">{line.slice(5)}</pre>
                ) : (
                  <p key={j} className="flex gap-2 text-sm leading-relaxed text-slate-300"><span className="text-sky-500">•</span><span>{line}</span></p>
                )
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
