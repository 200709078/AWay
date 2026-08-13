import 'dotenv/config';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { BootstrapModule } from './bootstrap.module';
import {
  BootstrapSchoolService,
  type CreateInitialSchoolInput,
} from './bootstrap-school.service';

const CONFIRMATION_VALUE = 'CREATE_INITIAL_SCHOOL_ADMIN';

const CLI_OPTIONS = [
  'school-code',
  'school-name',
  'admin-first-name',
  'admin-last-name',
  'admin-phone',
  'confirm',
] as const;

type CliOption = (typeof CLI_OPTIONS)[number];

function parseInput(argv: string[]): CreateInitialSchoolInput {
  const values = new Map<CliOption, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (!argument.startsWith('--')) {
      throw new Error(`Geçersiz parametre: ${argument}`);
    }

    const option = argument.slice(2) as CliOption;

    if (!CLI_OPTIONS.includes(option)) {
      throw new Error(`Bilinmeyen parametre: ${argument}`);
    }

    if (values.has(option)) {
      throw new Error(`Parametre yalnız bir kez verilebilir: ${argument}`);
    }

    const value = argv[index + 1];

    if (!value || value.startsWith('--')) {
      throw new Error(`Parametre için değer gerekli: ${argument}`);
    }

    values.set(option, value);
    index += 1;
  }

  const missing = CLI_OPTIONS.filter((option) => !values.has(option));

  if (missing.length > 0) {
    throw new Error(
      `Eksik parametreler: ${missing.map((option) => `--${option}`).join(', ')}`,
    );
  }

  if (values.get('confirm') !== CONFIRMATION_VALUE) {
    throw new Error(
      `İşlemi onaylamak için --confirm ${CONFIRMATION_VALUE} kullanın.`,
    );
  }

  return {
    schoolCode: values.get('school-code')!,
    schoolName: values.get('school-name')!,
    adminFirstName: values.get('admin-first-name')!,
    adminLastName: values.get('admin-last-name')!,
    adminPhone: values.get('admin-phone')!,
  };
}

async function main() {
  let app: INestApplicationContext | undefined;

  try {
    const input = parseInput(process.argv.slice(2));
    app = await NestFactory.createApplicationContext(BootstrapModule, {
      logger: ['error', 'warn'],
    });

    const bootstrapSchool = app.get(BootstrapSchoolService);
    const result = await bootstrapSchool.createInitialSchool(input);

    console.info(
      `Okul ve ilk ADMIN üyeliği oluşturuldu: ${result.school.code} (${result.school.id}).`,
    );
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Bootstrap başarısız.',
    );
    process.exitCode = 1;
  } finally {
    await app?.close();
  }
}

void main();
