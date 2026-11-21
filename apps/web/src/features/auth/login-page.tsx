import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { loginSchema, type LoginInput } from '@pulse/shared';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { applyServerErrors } from '@/lib/forms';
import type { Me } from '@/types/api';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { AuthShell } from './auth-shell';

export default function LoginPage() {
  const { setMe } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/app';
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (values) => {
    try {
      setMe(await api.post<Me>('/auth/login', values));
      navigate(from, { replace: true });
    } catch (err) {
      applyServerErrors(err, setError, ['email', 'password']);
    }
  });

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your workspace." footer={<>New to PULSE? <Link to="/register" className="text-brass hover:underline">Create a workspace</Link></>}>
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <Field id="email" label="Email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" autoFocus aria-invalid={!!errors.email} {...register('email')} />
        </Field>
        <Field id="password" label="Password" error={errors.password?.message}>
          <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!errors.password} {...register('password')} />
        </Field>
        <Button type="submit" variant="primary" size="lg" loading={isSubmitting} className="mt-2">Sign in</Button>
      </form>
    </AuthShell>
  );
}
