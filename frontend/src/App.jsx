import React, { useEffect } from 'react';
import './App.css';
import Pages from '@/pages/index.jsx';
import { Toaster } from '@/components/ui/toaster';
import axios from '@/api/axiosClient';

function App() {
  useEffect(() => {
    // 1) Ask backend for a CSRF token; it will also set the csrftoken cookie
    axios.get('auth/csrf/')
      .then(res => {
        if (res?.data?.csrftoken) {
          // 2) Attach token to all subsequent mutating requests
          axios.defaults.headers.common['X-CSRFToken'] = res.data.csrftoken;
        }
      })
      .catch(() => {});
  }, []);

  return (
    <>
      <Pages />
      <Toaster />
    </>
  );
}

export default App;
