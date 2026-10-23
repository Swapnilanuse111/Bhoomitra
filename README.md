 <div align="center">

<img src="https://img.icons8.com/color/96/leaf.png" width="70" alt="Bhoomitra logo"/>

# 🌱 Bhoomitra

**A Smart Agriculture Platform Connecting Farmers with Technology, AI, and Sustainable Farming.**

Helping farmers access agricultural information, manage farming activities, and explore AI-powered plant health assistance.

![React](https://img.shields.io/badge/React-2023A2?style=flat-square&logo=react&logoColor=61DAFB)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![Python](https://img.shields.io/badge/Python-3.x-3776AB?style=flat-square&logo=python&logoColor=white)
![Django](https://img.shields.io/badge/Django-Backend-092E20?style=flat-square&logo=django&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-Frontend-646CFF?style=flat-square&logo=vite&logoColor=white)
![AI/ML](https://img.shields.io/badge/AI%2FML-In%20Development-orange?style=flat-square)
![Status](https://img.shields.io/badge/Project-Under%20Development-blue?style=flat-square)

[Features](#-features) •
[Tech Stack](#-tech-stack) •
[Architecture](#-project-architecture) •
[Getting Started](#-getting-started) •
[AI Disease Detection](#-ai-powered-pomegranate-disease-detection) •
[Roadmap](#-roadmap) •
[Contributing](#-contributing)

</div>

---

## 📖 About

**Bhoomitra** is a smart agriculture project designed to support farmers through modern web technologies and artificial intelligence.

The platform aims to bring useful agricultural tools into one place, making it easier for farmers to explore farming resources, manage agricultural activities, and access plant health information.

The project uses a React-based frontend and a Python backend architecture. An AI-powered pomegranate disease detection module is planned to help identify potential plant health issues from uploaded images.

Bhoomitra is being developed with a focus on usability, accessibility, responsive design, and future AI integration.

## ✨ Features

- 🌱 **Smart Agriculture Platform** — a dedicated platform for farming-related information and tools.
- 🎨 **Modern User Interface** — a custom-designed interface with a green agricultural theme.
- 📱 **Responsive Design** — designed to support different screen sizes.
- ⚛️ **React Frontend** — reusable components and a modern frontend architecture.
- 🐍 **Python Backend** — planned Django integration for backend services and APIs.
- 🍎 **Pomegranate Health Detection** — planned AI/ML feature to analyze uploaded pomegranate images.
- 🌐 **Localization Support** — localization infrastructure included in the frontend.
- 🧩 **Modular Architecture** — organized frontend and backend directories to support future development.
- 🚀 **Deployment Ready Frontend** — Vite production builds and a frontend deployment workflow.

*Note: Features involving backend APIs, trained AI models, or database integration should be considered in development until they are implemented and tested.*

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React.js, JavaScript |
| Build Tool | Vite |
| Styling | CSS3 |
| Routing | React Router |
| Backend | Python, Django — planned/integration in progress |
| API Layer | Django REST Framework — planned |
| Database | To be configured |
| AI/ML | Python, NumPy, Pandas, Scikit-learn — planned learning/integration |
| Image Processing | OpenCV — planned |
| Deep Learning | TensorFlow/Keras — planned |
| Version Control | Git, GitHub |
| Deployment | Vercel for frontend |

## 🏗️ Project Architecture

Bhoomitra follows a frontend/backend structure designed to separate the user interface from server-side logic.

```text
Bhoomitra/
│
├── frontend/
│   ├── public/
│   ├── src/
│   │   └── bhoomitra/
│   │       ├── BhoomitraApp.jsx
│   │       ├── bhoomitra.css
│   │       └── localization.js
│   ├── package.json
│   ├── vite.config.js
│   └── index.html
│
├── backend/
│   └── Python backend and API modules
│
├── docker/
│   └── Container configuration and related files
│
├── .env.example
├── .gitignore
├── docker-compose.yml
└── README.md
```

*The structure above highlights the known frontend files and top-level directories. Backend modules and additional files may vary as development progresses.*

## 🚀 Getting Started

### Prerequisites

Install the following tools before running the project:

- [Node.js](https://nodejs.org/) — preferably an LTS version.
- [npm](https://www.npmjs.com/) — included with Node.js.
- [Git](https://git-scm.com/).
- [Python](https://www.python.org/) — required for the Python backend when configured.
- [VS Code](https://code.visualstudio.com/) — recommended editor.

### 1. Clone the repository

```bash
git clone https://github.com/Swapnilanuse111/Bhoomitra.git
cd Bhoomitra
```

### 2. Start the React frontend

```bash
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite in your terminal, usually:

`http://localhost:5173/`

### 3. Build the frontend

To verify that the production frontend builds successfully:

```bash
npm run build
```

To preview the production build locally:

```bash
npm run preview
```

### 4. Configure the Python backend

The backend setup depends on the Django application files and dependencies present in the repository.

Once the Django application and its dependency file are configured, open another terminal and run the following from the backend directory:

```bash
cd backend
python -m venv .venv
```

Activate the environment on Windows:

```powershell
.\.venv\Scripts\Activate.ps1
```

Install dependencies using the backend's existing `requirements.txt`, if present:

```bash
pip install -r requirements.txt
```

If the Django `manage.py` file is configured in that directory, run:

```bash
python manage.py migrate
python manage.py runserver
```

The default Django development server address is:

`http://127.0.0.1:8000/`

**Important:** The Django commands require a configured Django project. The backend dependencies, database settings, and API routes must be set up before these commands can run successfully.

## 🍎 AI-Powered Pomegranate Disease Detection

One planned feature of Bhoomitra is an AI-based pomegranate plant health assistant.

### Proposed workflow

1. The user uploads a pomegranate plant or fruit image.
2. The frontend sends the image to a Python API.
3. The backend validates the uploaded image.
4. A trained image-classification model analyzes the image.
5. The API returns the predicted class and available confidence information.
6. The frontend displays the result with appropriate guidance.

### Planned technologies

| Component | Technology |
|---|---|
| Image upload interface | React.js |
| API | Django REST Framework |
| Image processing | Pillow or OpenCV |
| Model development | Python, TensorFlow/Keras |
| Initial dataset | Small, labeled demonstration dataset |
| Future model | Expanded, quality-checked dataset |

The initial development approach is to test a small dataset with basic classes such as **Healthy** and **Diseased**, then expand to verified disease categories.

**Important:** The disease detection model is a planned feature, not a confirmed working diagnostic system. Predictions from a future model should be treated as preliminary guidance and verified by an agricultural expert.

## 🖼️ Screenshots

Add screenshots of your actual application to the repository and update the image paths below.

<div align="center">

### 🏠 Bhoomitra Homepage

![Bhoomitra Homepage](C:\Users\Swapnil Anuse\OneDrive\Pictures\Screenshots\Screenshot 2026-10-23 183038.png)

### 🌿 Agriculture Dashboard

![Bhoomitra Dashboard](docs/screenshots/dashboard.png)

### 🍎 Pomegranate Disease Detection

![Pomegranate Disease Detection](docs/screenshots/pomegranate-detection.png)

</div>

*These are suggested screenshot paths. Add the corresponding image files before expecting them to display on GitHub.*

## 🗺️ Roadmap

- [x] React frontend foundation.
- [x] Custom Bhoomitra interface and styling.
- [x] Frontend routing setup.
- [x] Localization infrastructure.
- [ ] Complete Django backend integration.
- [ ] Configure database models and migrations.
- [ ] Build and test agriculture-related REST APIs.
- [ ] Develop the pomegranate image upload feature.
- [ ] Prepare a labeled demonstration dataset.
- [ ] Train and evaluate an initial AI classification model.
- [ ] Connect the trained model to the backend API.
- [ ] Display prediction results and confidence information.
- [ ] Test the complete frontend-to-backend workflow.
- [ ] Expand the dataset and evaluate the model on unseen images.
- [ ] Deploy the complete application.

## 🔒 Environment Configuration

Store private credentials and environment-specific settings in environment files rather than committing them to GitHub.

For example:

```text
# Example configuration only
DEBUG=True
SECRET_KEY=your-local-development-secret
DATABASE_URL=your-database-connection
```

Use the actual variable names required by your backend configuration. Do not publish real passwords, API keys, or production secrets.

## 🤝 Contributing

Contributions, suggestions, and bug reports are welcome.

1. Fork the repository.
2. Create a feature branch:

   ```bash
   git checkout -b feature/your-feature
   ```

3. Commit your changes:

   ```bash
   git commit -m "Add your feature"
   ```

4. Push your branch:

   ```bash
   git push origin feature/your-feature
   ```

5. Open a Pull Request.

## 📄 License

Choose and add an appropriate open-source license before distributing the project. If you select the MIT License, include a `LICENSE` file containing the correct license text.

## 👨‍💻 Author

**Swapnil Anuse**

MCA — Shivaji University, Kolhapur

[![GitHub](https://img.shields.io/badge/GitHub-Swapnilanuse111-181717?style=flat-square&logo=github)](https://github.com/Swapnilanuse111)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Connect-0A66C2?style=flat-square&logo=linkedin)](https://linkedin.com/in/swapnil-anuse-94016319)
[![Email](https://img.shields.io/badge/Email-Contact-D14836?style=flat-square&logo=gmail&logoColor=white)](mailto:swapnilanuse111@gmail.com)

---

<div align="center">

**🌱 Bhoomitra — Growing a smarter future for agriculture.**

⭐ If you find this project useful, consider giving it a star on GitHub!

</div>
