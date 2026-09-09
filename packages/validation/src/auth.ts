import { z } from 'zod';

/** Sign in and sign up share the same shape. */
export const credentialsSchema = z.object({
  email: z.email('Correo no válido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
});

export type CredentialsInput = z.infer<typeof credentialsSchema>;
