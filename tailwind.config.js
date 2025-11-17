/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: false,
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "custom-green": "var(--color-green)",
        "custom-red": "var(--color-red)",
        "custom-blue": "var(--color-blue)",
        "custom-orange": "var(--color-orange)",
        "custom-pink": "var(--color-pink)",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
        "search-gradient":
          "linear-gradient(90deg, #F6AFFF 0%, #D9D9FF 50%, #A7ABFF 97%)",
        "master-brand-gradient":
          "linear-gradient(90deg, #E9E8E7 26.47%, rgba(233, 232, 231, 0.00) 99.93%), linear-gradient(270deg, #F6AFFF -3.33%, #FFB592 6.18%, #FAB920 15.68%, #84DB1A 29.94%, #E9E8E7 79.36%)",
        "master-brand-button-gradient":
          "linear-gradient(90deg, #60E21B -113.54%, #FABA17 -44.14%, #FFB592 33.8%, #FFB0CD 100%)",
      },
      boxShadow: {
        card: "0 8px 18px 0 rgba(29,28,27,0.15)",
      },
    },
  },
  plugins: [],
};
