import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth, canAccess } from "@/context/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import AppLayout from "@/components/AppLayout";
import { Loading } from "@/components/common";

import Login from "@/pages/Login";
import Overview from "@/pages/Overview";
import Streams from "@/pages/Streams";
import Engine from "@/pages/Engine";
import System from "@/pages/System";
import Sources from "@/pages/Sources";
import Transcoding from "@/pages/Transcoding";
import Media from "@/pages/Media";
import Analytics from "@/pages/Analytics";
import UsersPage from "@/pages/Users";
import SettingsPage from "@/pages/Settings";

function Protected({ children, module }) {
  const { user } = useAuth();
  if (user === null) return <div className="min-h-screen bg-[#090D14]"><Loading /></div>;
  if (user === false) return <Navigate to="/login" replace />;
  if (module && !canAccess(user, module)) return <Navigate to="/" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Protected module="overview"><Overview /></Protected>} />
            <Route path="/streams" element={<Protected module="streams"><Streams /></Protected>} />
            <Route path="/engine" element={<Protected module="engine"><Engine /></Protected>} />
            <Route path="/system" element={<Protected module="system"><System /></Protected>} />
            <Route path="/sources" element={<Protected module="sources"><Sources /></Protected>} />
            <Route path="/transcoding" element={<Protected module="transcoding"><Transcoding /></Protected>} />
            <Route path="/media" element={<Protected module="media"><Media /></Protected>} />
            <Route path="/analytics" element={<Protected module="analytics"><Analytics /></Protected>} />
            <Route path="/users" element={<Protected module="users"><UsersPage /></Protected>} />
            <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" theme="dark" />
      </AuthProvider>
    </div>
  );
}

export default App;
