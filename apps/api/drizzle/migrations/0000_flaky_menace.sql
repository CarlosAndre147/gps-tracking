CREATE TYPE "public"."Role" AS ENUM('SYSTEM_ADMIN', 'COMPANY_ADMIN', 'USER');--> statement-breakpoint
CREATE TABLE "AuditLog" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text,
	"action" text NOT NULL,
	"target" text,
	"targetType" text,
	"metadata" jsonb,
	"ip" text,
	"userAgent" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "RefreshToken" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"tokenDigest" text NOT NULL,
	"expiresAt" timestamp (3) NOT NULL,
	"usedAt" timestamp (3),
	"revokedAt" timestamp (3),
	"userAgent" text,
	"ip" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "RefreshToken_tokenDigest_unique" UNIQUE("tokenDigest")
);
--> statement-breakpoint
CREATE TABLE "User" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"cpf" text NOT NULL,
	"phone" text NOT NULL,
	"passwordHash" text NOT NULL,
	"role" "Role" DEFAULT 'USER' NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"lastSeenAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "User_email_unique" UNIQUE("email"),
	CONSTRAINT "User_cpf_unique" UNIQUE("cpf")
);
--> statement-breakpoint
CREATE TABLE "Company" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"cnpj" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "Company_cnpj_unique" UNIQUE("cnpj")
);
--> statement-breakpoint
CREATE TABLE "UserCompany" (
	"userId" text NOT NULL,
	"companyId" text NOT NULL,
	CONSTRAINT "UserCompany_userId_companyId_pk" PRIMARY KEY("userId","companyId")
);
--> statement-breakpoint
CREATE TABLE "Location" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"accuracy" double precision,
	"speed" double precision,
	"heading" double precision,
	"altitude" double precision,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "TrackingSession" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"startedAt" timestamp (3) DEFAULT now() NOT NULL,
	"stoppedAt" timestamp (3),
	"source" text DEFAULT 'web' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "UserCompany" ADD CONSTRAINT "UserCompany_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "UserCompany" ADD CONSTRAINT "UserCompany_companyId_Company_id_fk" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Location" ADD CONSTRAINT "Location_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "TrackingSession" ADD CONSTRAINT "TrackingSession_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;