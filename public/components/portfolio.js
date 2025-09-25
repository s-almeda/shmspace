//components/portfolio.js
class Portfolio extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
  <link href="https://fonts.googleapis.com/css?family=Fira+Sans" rel="stylesheet">

  <link rel="stylesheet" href="https://unpkg.com/xp.css" />

  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <link rel="stylesheet" type="text/css" href="/css/styles.css" />
<details open >
                      <summary><strong>currently... </strong><span style="color: #de7e00; font-size: 12px;">(click to expand)</span></summary>
                      <ul>
                        <li>SF Bay Area artist, computer scientist, & arts sociotechnologist</li> 
                        <li>Final year PhD in EECS at UC Berkeley </li>
                        <ul>
                          <li> advised by <a class="link" target="_blank" href="https://people.eecs.berkeley.edu/~bjoern/">Björn Hartmann.</a> </li>
                        </ul>
                        <li>Human-Computer Interaction researcher taking a critical, community-centered lens to artistic data technologies & trends</li>
                        <li>Chancellor's Fellow, Responsible Decentralized Intelligence (RDI) Frontier Research Fellow</li>
                        <li>Visiting researcher at the Midjourney Storytelling Research Lab</li>
                        <ul><li>mentored by <a class="link" target="_blank" href="https://mkremins.github.io/">Max Kreminski</a> and <a class="link" target="_blank" href="https://johnr0.github.io/">John Joon Young Chung</a></li></ul>
                      </ul>
                    </details>
                    <details closed>
                      <summary><strong>previously... </strong><span style="color: #de7e00; font-size: 12px;">(click to expand)</span></summary>
                      <ul class="tree-view">
                        <li>a <a class ="link" target="_blank" href="https://shmgaranganao.myportfolio.com/shm-x-bart">train</a></li>
                        <li>Class of 2020 @ The College of New Jersey</li>
                         <ul> <li>Computer Science + Fine Art </li> </ul>
                        <li>Adobe Research Fellow & Intern</li>
                          <ul> 
                            <li>Co-Creation for Audio, Video, and Animation Lab (2024)</li>
                            <ul><li>mentored by <a class="link" target="_blank" href="https://joyk.im/">Joy Kim</a></li></ul>
                            <li>Computational Artistry Team (2019)</li>
                            <ul><li>mentored by <a class="link" target="_blank"  href="https://www.jiechevarria.com/">Jose Echevarria</a> and <a class="link" target="_blank" href="https://www.stephendiverdi.com/"> Stephen DiVerdi</a></li></ul>
                          </ul>
                      </ul>
                      
                    </details>
        `;
    }
}

customElements.define('portfolio-component', Portfolio);
