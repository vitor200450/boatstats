import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];

  if (!email) {
    console.error("Please provide an email address as the first argument.");
    console.error("Usage: bun run scripts/elevate-super-admin.ts <email>");
    process.exit(1);
  }

  try {
    const user = await prisma.user.update({
      where: { email },
      data: {
        role: "SUPER_ADMIN",
      },
    });

    console.log(`✅ Successfully elevated user ${email} to SUPER_ADMIN.`);
    console.log("Updated User Record:");
    console.log(JSON.stringify(user, null, 2));
  } catch (error) {
    console.error(
      `❌ Failed to elevate user ${email}. Are you sure they exist in the database?`,
    );
    console.error(error);
    process.exit(1);
  }
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
