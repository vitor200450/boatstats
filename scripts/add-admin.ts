import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];

  if (!email) {
    console.error("Please provide an email address as an argument.");
    console.error("Usage: bun run scripts/add-admin.ts <email>");
    process.exit(1);
  }

  try {
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        role: "ADMIN",
      },
      create: {
        email,
        role: "ADMIN",
      },
    });

    console.log(`✅ Successfully added/updated Admin: ${user.email}`);
  } catch (error) {
    console.error("Error adding admin:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
