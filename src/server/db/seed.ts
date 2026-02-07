import { db } from "./index.ts";
import { categories, questions } from "./schema.ts";

const seedData = [
  {
    category: "Science",
    questions: [
      {
        questionText: "What is the chemical symbol for gold?",
        options: ["Ag", "Au", "Fe", "Cu"],
        correctIndex: 1,
      },
      {
        questionText: "What planet is known as the Red Planet?",
        options: ["Venus", "Jupiter", "Mars", "Saturn"],
        correctIndex: 2,
      },
      {
        questionText: "What is the powerhouse of the cell?",
        options: ["Nucleus", "Ribosome", "Mitochondria", "Golgi apparatus"],
        correctIndex: 2,
      },
      {
        questionText: "What gas do plants absorb from the atmosphere?",
        options: ["Oxygen", "Nitrogen", "Carbon dioxide", "Hydrogen"],
        correctIndex: 2,
      },
      {
        questionText: "What is the speed of light in a vacuum (approx)?",
        options: [
          "300,000 km/s",
          "150,000 km/s",
          "1,000,000 km/s",
          "30,000 km/s",
        ],
        correctIndex: 0,
      },
    ],
  },
  {
    category: "History",
    questions: [
      {
        questionText: "In what year did World War II end?",
        options: ["1943", "1944", "1945", "1946"],
        correctIndex: 2,
      },
      {
        questionText: "Who was the first President of the United States?",
        options: [
          "John Adams",
          "Thomas Jefferson",
          "George Washington",
          "Benjamin Franklin",
        ],
        correctIndex: 2,
      },
      {
        questionText:
          "The Great Wall of China was primarily built to protect against whom?",
        options: ["Japanese", "Mongols", "Koreans", "Russians"],
        correctIndex: 1,
      },
      {
        questionText: "Which empire was ruled by Genghis Khan?",
        options: [
          "Ottoman Empire",
          "Roman Empire",
          "Mongol Empire",
          "Persian Empire",
        ],
        correctIndex: 2,
      },
      {
        questionText: "In what year did the Titanic sink?",
        options: ["1905", "1912", "1918", "1920"],
        correctIndex: 1,
      },
    ],
  },
  {
    category: "Geography",
    questions: [
      {
        questionText: "What is the largest continent by area?",
        options: ["Africa", "North America", "Europe", "Asia"],
        correctIndex: 3,
      },
      {
        questionText: "Which country has the most natural lakes?",
        options: ["USA", "Canada", "Russia", "Brazil"],
        correctIndex: 1,
      },
      {
        questionText: "What is the longest river in the world?",
        options: ["Amazon", "Nile", "Yangtze", "Mississippi"],
        correctIndex: 1,
      },
      {
        questionText: "What is the smallest country in the world?",
        options: ["Monaco", "Vatican City", "San Marino", "Liechtenstein"],
        correctIndex: 1,
      },
      {
        questionText:
          "Mount Everest is located on the border of which two countries?",
        options: [
          "India and China",
          "Nepal and China",
          "Nepal and India",
          "China and Pakistan",
        ],
        correctIndex: 1,
      },
    ],
  },
  {
    category: "Entertainment",
    questions: [
      {
        questionText: "Who directed the movie Inception?",
        options: [
          "Steven Spielberg",
          "Christopher Nolan",
          "Martin Scorsese",
          "James Cameron",
        ],
        correctIndex: 1,
      },
      {
        questionText:
          "What is the highest-grossing film of all time (not adjusted for inflation)?",
        options: [
          "Avengers: Endgame",
          "Avatar",
          "Titanic",
          "Star Wars: The Force Awakens",
        ],
        correctIndex: 1,
      },
      {
        questionText: "Which band released the album 'Abbey Road'?",
        options: [
          "The Rolling Stones",
          "The Beatles",
          "Led Zeppelin",
          "Pink Floyd",
        ],
        correctIndex: 1,
      },
      {
        questionText:
          "In the TV show Breaking Bad, what is Walter White's alias?",
        options: ["Heisenberg", "The Professor", "Scarface", "The Chemist"],
        correctIndex: 0,
      },
      {
        questionText: "What year was the first Harry Potter book published?",
        options: ["1995", "1997", "1999", "2001"],
        correctIndex: 1,
      },
    ],
  },
  {
    category: "Technology",
    questions: [
      {
        questionText: "Who co-founded Apple Computer with Steve Jobs?",
        options: ["Bill Gates", "Steve Wozniak", "Paul Allen", "Larry Ellison"],
        correctIndex: 1,
      },
      {
        questionText: "What does HTTP stand for?",
        options: [
          "HyperText Transfer Protocol",
          "High Tech Transfer Protocol",
          "HyperText Transmission Process",
          "High Transfer Text Protocol",
        ],
        correctIndex: 0,
      },
      {
        questionText: "In what year was the World Wide Web invented?",
        options: ["1985", "1989", "1993", "1995"],
        correctIndex: 1,
      },
      {
        questionText:
          "What programming language was created by Brendan Eich in 10 days?",
        options: ["Java", "Python", "JavaScript", "Ruby"],
        correctIndex: 2,
      },
      {
        questionText: "What does CPU stand for?",
        options: [
          "Central Processing Unit",
          "Computer Personal Unit",
          "Central Program Utility",
          "Core Processing Unit",
        ],
        correctIndex: 0,
      },
    ],
  },
];

async function seed() {
  console.log("Seeding database...");

  for (const data of seedData) {
    const [category] = await db
      .insert(categories)
      .values({ name: data.category })
      .onConflictDoNothing()
      .returning();

    if (!category) {
      console.log(`  Category "${data.category}" already exists, skipping.`);
      continue;
    }

    for (const q of data.questions) {
      await db.insert(questions).values({
        categoryId: category.id,
        questionText: q.questionText,
        options: JSON.stringify(q.options),
        correctIndex: q.correctIndex,
      });
    }

    console.log(
      `  Seeded "${data.category}" with ${data.questions.length} questions.`
    );
  }

  console.log("Done.");
  process.exit(0);
}

void seed();
