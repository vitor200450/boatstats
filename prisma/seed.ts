import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting database seed...");

  // Create SUPER_ADMIN users for development
  const adminEmails = [
    "vitorgames10080@gmail.com", // Discord account
    "admin@boatracing.local", // Dev impersonator fallback
  ];

  for (const adminEmail of adminEmails) {
    const existingAdmin = await prisma.user.findUnique({
      where: { email: adminEmail },
    });

    if (existingAdmin) {
      console.log("✓ Admin user already exists:", existingAdmin.email);

      // Ensure role is SUPER_ADMIN
      if (existingAdmin.role !== "SUPER_ADMIN") {
        await prisma.user.update({
          where: { id: existingAdmin.id },
          data: { role: "SUPER_ADMIN" },
        });
        console.log("✓ Updated role to SUPER_ADMIN:", adminEmail);
      }
    } else {
      const admin = await prisma.user.create({
        data: {
          email: adminEmail,
          name:
            adminEmail === "vitorgames10080@gmail.com"
              ? "Vitor (Discord)"
              : "Super Admin",
          role: "SUPER_ADMIN",
          emailVerified: new Date(),
        },
      });
      console.log("✓ Created SUPER_ADMIN:", admin.email);
    }
  }

  console.log("✅ Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
