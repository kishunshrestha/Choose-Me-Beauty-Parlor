import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { PublicSite } from './public';
import './styles.css';
const Admin=React.lazy(()=>import('./admin'));
createRoot(document.getElementById('root')!).render(<React.StrictMode>{window.location.pathname.startsWith('/admin') ? <Suspense fallback={<div className="page-loading">Opening your studio…</div>}><Admin/></Suspense> : <PublicSite/>}</React.StrictMode>);
