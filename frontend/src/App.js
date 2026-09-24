import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import AppLayout from "@/components/AppLayout";
import { Loading } from "@/components/common";

import Login from "@/pages/Login";
import Overview from "@/pages/Overview";
import Streams from "@/pages/Streams";
import Sources from "@/pages/Sources";
import Transcoding from "@/pages/Transcoding";
import Media from "@/pages/Media";
import Analytics from "@/pages/Analytics";
import UsersPage from "@/pages/Users";
import SettingsPage from "@/pages/Settings";

function Protected({ children }) {
  const { user } = useAuth();
  if (user === null) return <div className="min-h-screen bg-[#090D14]"><Loading /></div>;
  if (user === false) return <Navigate to="/login" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Protected><Overview /></Protected>} />
            <Route path="/streams" element={<Protected><Streams /></Protected>} />
            <Route path="/sources" element={<Protected><Sources /></Protected>} />
            <Route path="/transcoding" element={<Protected><Transcoding /></Protected>} />
            <Route path="/media" element={<Protected><Media /></Protected>} />
            <Route path="/analytics" element={<Protected><Analytics /></Protected>} />
            <Route path="/users" element={<Protected><UsersPage /></Protected>} />
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
