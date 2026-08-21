import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { SessionProvider, useSession } from "@/lib/session";
import { LangProvider } from "@/lib/i18n";

import RoleLanding from "@/pages/RoleLanding";
import PatientLogin from "@/pages/patient/Login";
import PatientHome from "@/pages/patient/Home";
import PatientBooking from "@/pages/patient/Booking";
import PatientReceipt from "@/pages/patient/Receipt";
import PatientMyBookings from "@/pages/patient/MyBookings";
import ClinicLogin from "@/pages/clinic/Login";
import ClinicDashboard from "@/pages/clinic/Dashboard";
import ClinicSettings from "@/pages/clinic/Settings";
import AdminLogin from "@/pages/admin/Login";
import AdminDashboard from "@/pages/admin/Dashboard";

function Guard({ role, children }) {
  const { ready, session } = useSession();
  if (!ready) return <div className="min-h-screen bg-[#F8F5EF] flex items-center justify-center text-[#5A5850]">…</div>;
  if (!session || session.role !== role) {
    const map = { patient: "/patient/login", clinic: "/clinic/login", admin: "/admin/login" };
    return <Navigate to={map[role]} replace />;
  }
  return children;
}

function App() {
  return (
    <div className="App min-h-screen bg-[#F8F5EF] text-[#1F1D18]">
      <BrowserRouter>
        <LangProvider>
          <SessionProvider>
            <Routes>
              <Route path="/" element={<RoleLanding />} />

              <Route path="/patient/login" element={<PatientLogin />} />
              <Route path="/patient" element={<Guard role="patient"><PatientHome /></Guard>} />
              <Route path="/patient/book/:clinicId" element={<Guard role="patient"><PatientBooking /></Guard>} />
              <Route path="/patient/receipt/:appointmentId" element={<Guard role="patient"><PatientReceipt /></Guard>} />
              <Route path="/patient/my-bookings" element={<Guard role="patient"><PatientMyBookings /></Guard>} />

              <Route path="/clinic/login" element={<ClinicLogin />} />
              <Route path="/clinic" element={<Guard role="clinic"><ClinicDashboard /></Guard>} />
              <Route path="/clinic/settings" element={<Guard role="clinic"><ClinicSettings /></Guard>} />

              <Route path="/admin/login" element={<AdminLogin />} />
              <Route path="/admin" element={<Guard role="admin"><AdminDashboard /></Guard>} />
            </Routes>
            <Toaster position="top-center" richColors />
          </SessionProvider>
        </LangProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
