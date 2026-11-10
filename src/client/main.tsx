import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';
import { App } from '@/app';
import '@/globals.css';

/** retry: 1 —— 本站接口都在同一个 Worker 里，读失败基本是上游（Bangumi）挂了，重试多次只是把「暂时取不到」推迟几秒；refetchOnWindowFocus: false —— 番剧数据以天为单位变化，切回标签页不必重取。 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
