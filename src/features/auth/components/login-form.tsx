'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { Building2, Phone, LogIn } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/features/auth/hooks/use-auth-store';

const loginSchema = z.object({
  companyCode: z
    .string()
    .min(1, '회사 코드를 입력해주세요')
    .max(20, '회사 코드는 20자 이내로 입력해주세요'),
  phoneNumber: z
    .string()
    .min(1, '전화번호를 입력해주세요')
    .regex(/^[0-9]{10,11}$/, '올바른 전화번호를 입력해주세요 (숫자만, 10~11자리)'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = (data: LoginFormValues) => {
    login({
      companyCode: data.companyCode,
      phoneNumber: data.phoneNumber,
    });
    router.push('/menu');
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="companyCode" className="text-sm font-medium text-gray-700">
          회사 코드
        </Label>
        <div className="relative">
          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            id="companyCode"
            placeholder="회사 코드를 입력하세요"
            className="pl-10 h-12 text-base"
            {...register('companyCode')}
          />
        </div>
        {errors.companyCode && (
          <p className="text-xs text-red-500">{errors.companyCode.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="phoneNumber" className="text-sm font-medium text-gray-700">
          전화번호
        </Label>
        <div className="relative">
          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            id="phoneNumber"
            type="tel"
            placeholder="전화번호를 입력하세요 (숫자만)"
            className="pl-10 h-12 text-base"
            inputMode="numeric"
            {...register('phoneNumber')}
          />
        </div>
        {errors.phoneNumber && (
          <p className="text-xs text-red-500">{errors.phoneNumber.message}</p>
        )}
      </div>

      <Button
        type="submit"
        disabled={isSubmitting}
        className="h-12 text-base font-semibold mt-2 gap-2"
      >
        <LogIn className="w-4 h-4" />
        로그인
      </Button>
    </form>
  );
}
