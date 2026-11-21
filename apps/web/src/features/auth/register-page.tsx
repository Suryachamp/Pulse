import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { registerSchema, type RegisterInput } from '@pulse/shared';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { applyServerErrors } from '@/lib/forms';
import type { Me } from '@/types/api';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { AuthShell } from './auth-shell';

export default function RegisterPage() {
  const { setMe } = useSession();
  const navigate = useNavigate();
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  const onSubmit = handleSubmit(async (values) => {
    try {
      setMe(await api.post<Me>('/auth/register', values));
      navigate('/app', { replace: true });
    } catch (err) {
      applyServerErrors(err, setError, ['name', 'email', 'password', 'organizationName']);
    }
  });

  return (
    <AuthShell title="Set up your workspace" subtitle="You’ll be the owner. Invite your team once you’re in." footer={<>Already have an account? <Link to="/login" className="text-brass hover:underline">Sign in</Link></>}>
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <Field id="organizationName" label="Business name" error={errors.organizationName?.message}>
          <Input id="organizationName" autoFocus autoComplete="organization" aria-invalid={!!errors.organizationName} {...register('organizationName')} />
        </Field>
        <Field id="name" label="Your name" error={errors.name?.message}>
          <Input id="name" autoComplete="name" aria-invalid={!!errors.name} {...register('name')} />
        </Field>
        <Field id="email" label="Work email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register('email')} />
        </Field>
        <Field id="password" label="Password" hint="At least 10 characters, with a letter and a number." error={errors.password?.message}>
          <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...register('password')} />
        </Field>
        <Button type="submit" variant="primary" size="lg" loading={isSubmitting} className="mt-2">Create workspace</Button>
      </form>
    </AuthShell>
  );
}
