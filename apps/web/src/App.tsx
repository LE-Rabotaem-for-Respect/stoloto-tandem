import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import {
  AdminEventsPage,
  AdminMessagesPage,
  AdminOrganizationsPage,
  AdminOverviewPage,
} from './features/admin/AdminPages';
import { AppLayout } from './features/navigation/AppLayout';
import { OrganizationPage, PublicOrganizationPage } from './features/organizations';
import {
  CreateEventPage,
  EventPage,
  FeedPage,
  LoginPage,
  MyParticipationsPage,
  NotFoundPage,
  NotificationsPage,
  ProfilePage,
  RegisterPage,
} from './pages/pages';
import { ThemeProvider } from './shared/theme';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
}

/** Маршруты без роутера — чтобы тесты могли подставить свой (MemoryRouter). */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<FeedPage />} />
        <Route path="events/:id" element={<EventPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="my" element={<MyParticipationsPage />} />
        <Route path="create" element={<CreateEventPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="admin" element={<AdminOverviewPage />} />
        <Route path="admin/organizations" element={<AdminOrganizationsPage />} />
        <Route path="admin/events" element={<AdminEventsPage />} />
        <Route path="admin/messages" element={<AdminMessagesPage />} />
        <Route path="organization" element={<OrganizationPage />} />
        <Route path="organizations/:id" element={<PublicOrganizationPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export function AppProviders({ client, children }: { client: QueryClient; children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  );
}

const queryClient = createQueryClient();

export function App() {
  return (
    <AppProviders client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AppProviders>
  );
}
