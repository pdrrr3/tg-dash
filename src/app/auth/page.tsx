import { AuthForm } from '@/components/auth/auth-form';

export default function AuthPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-white p-4 sm:p-6 lg:p-8 flex items-center justify-center">
      <AuthForm />
    </main>
  );
}
