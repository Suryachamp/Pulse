import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Toaster } from 'sonner';
import '@fontsource-variable/schibsted-grotesk';
import '@fontsource/instrument-serif';
import './styles/globals.css';
import { ApiError } from './lib/api';
import { ME_KEY, SessionProvider } from './lib/session';
import { router } from './routes/router';
import { FullPageLoader } from './routes/guards';

const onAuthLost = (err: unknown) => {
  // A 401 anywhere means the session ended (expired, revoked, removed from org).
  if (err instanceof ApiError && err.status === 401) queryClient.setQueryData(ME_KEY, null);
};

const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onAuthLost }),
  mutationCache: new MutationCache({ onError: onAuthLost }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <Tooltip.Provider>
          <Suspense fallback={<FullPageLoader />}>
            <RouterProvider router={router} />
          </Suspense>
          <Toaster theme="dark" position="bottom-right" toastOptions={{ classNames: { toast: '!bg-raised !border-line !text-ink', description: '!text-mist' } }} />
        </Tooltip.Provider>
      </SessionProvider>
    </QueryClientProvider>
  </StrictMode>,
);
