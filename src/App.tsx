import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import Layout from './components/Layout/Layout';
import Dashboard from './pages/Dashboard';
import FDPage from './pages/FDPage';
import StocksPage from './pages/StocksPage';
import MFPage from './pages/MFPage';
import PPFPage from './pages/PPFPage';
import PFPage from './pages/PFPage';

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="fd" element={<FDPage />} />
            <Route path="stocks" element={<StocksPage />} />
            <Route path="mf" element={<MFPage />} />
            <Route path="ppf" element={<PPFPage />} />
            <Route path="pf" element={<PFPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}
