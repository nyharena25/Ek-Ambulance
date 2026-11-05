# 9. References

<!--
Bibliography source. Each entry is one line: "- [@key] <IEEE-formatted entry>".
Section files cite with [@key] or [@a; @b]. `node report_source/assemble.mjs` numbers the cited entries in order of first
citation (IEEE), rewrites every citation to [n], prints this list in that order, and fails on an unknown key.
Entries that are not cited anywhere are listed after the numbered list under "Further reading".

Verification note (28 Oct 2026): entries that carry "Accessed: Sep. 17, 2026" are carried over unchanged from the authors'
earlier manuscript (Ek-Ambulance.md). All other online sources were compiled for this report without an access date;
open each URL and add "Accessed: <date>" before submission.
-->

## Domain, epidemiology and regulation

- [@morth2023] Ministry of Road Transport and Highways, Government of India, "Road Accidents in India 2023," New Delhi, India, Tech. Rep., 2025.
- [@dar2025] P. M. U. D. Dar, S. Kaur, A. K. Katiyar, P. Priyadarshani, S. Kumar, A. Gupta, and S. Sagar, "Prehospital care: Lessons learned from 311 mortalities at a level I trauma center," *Chinese Journal of Traumatology*, Feb. 2025, doi: 10.1016/j.cjtee.2025.02.011.
- [@roy2017] N. Roy et al., "Learning from 2523 trauma deaths in India—Opportunities to prevent in-hospital deaths," *BMC Health Services Research*, vol. 17, no. 1, p. 172, 2017.
- [@ummcGoldenHour] University of Maryland Medical Center, "History of the Shock Trauma Center: R Adams Cowley and the Golden Hour." Accessed: Sep. 17, 2026. [Online]. Available: https://www.umms.org/ummc/health-services/shock-trauma/about/history
- [@emri108] GVK Emergency Management and Research Institute (EMRI), "108 Emergency Response Service." Accessed: Sep. 17, 2026. [Online]. Available: https://www.emri.in/
- [@ais125p1] Automotive Research Association of India (ARAI), "Automotive Industry Standard AIS-125 (Part 1): National Ambulance Code," ARAI, Pune, India, Standard AIS-125-1, Aug. 2014.
- [@ais125p2] Automotive Research Association of India (ARAI), "Automotive Industry Standard AIS-125 (Part 2): Medical Equipment for Road Ambulances," ARAI, Pune, India, Standard AIS-125-2, Aug. 2014.
- [@dpdp2023] Ministry of Electronics and Information Technology (MeitY), Government of India, *Digital Personal Data Protection Act, 2023* and *Digital Personal Data Protection Rules, 2025*, Gazette Notification G.S.R. 846(E), Nov. 13, 2025.
- [@blackwell2002] T. H. Blackwell and J. S. Kaufman, "Response time effectiveness: Comparison of response time and survival in an urban emergency medical services system," *Academic Emergency Medicine*, vol. 9, no. 4, pp. 288–295, 2002.
- [@pons2002] P. T. Pons and V. J. Markovchick, "Eight minutes or less: Does the ambulance response time guideline impact trauma patient outcome?," *Journal of Emergency Medicine*, vol. 23, no. 1, pp. 43–48, 2002.

## Clinical triage

- [@benson1996] M. Benson, K. L. Koenig, and C. H. Schultz, "Disaster triage: START, then SAVE—A new method of dynamic triage for victims of a catastrophic earthquake," *Prehospital and Disaster Medicine*, vol. 11, no. 2, pp. 117–124, 1996.
- [@gilboy2012] N. Gilboy, P. Tanabe, D. Travers, and A. M. Rosenau, *Emergency Severity Index (ESI): A Triage Tool for Emergency Department Care, Version 4. Implementation Handbook 2012 Edition*, AHRQ Publication No. 12-0014. Rockville, MD, USA: Agency for Healthcare Research and Quality, 2011.
- [@mackway2014] Manchester Triage Group, K. Mackway-Jones, J. Marsden, and J. Windle, Eds., *Emergency Triage*, 3rd ed. Chichester, U.K.: Wiley-Blackwell, 2014.

## Ambulance operations research and on-demand dispatch

- [@brotcorne2003] L. Brotcorne, G. Laporte, and F. Semet, "Ambulance location and relocation models," *European Journal of Operational Research*, vol. 147, no. 3, pp. 451–463, 2003.
- [@jagtenberg2017] C. J. Jagtenberg, S. Bhulai, and R. D. van der Mei, "Dynamic ambulance dispatching: Is the closest-idle policy always optimal?," *Health Care Management Science*, vol. 20, no. 4, pp. 517–531, 2017.
- [@brodsky2018] I. Brodsky, "H3: Uber's Hexagonal Hierarchical Spatial Index," Uber Engineering Blog, 2018. Accessed: Sep. 17, 2026. [Online]. Available: https://www.uber.com/blog/h3/

## Spatial data and geodesy

- [@guttman1984] A. Guttman, "R-trees: A dynamic index structure for spatial searching," in *Proc. ACM SIGMOD Int. Conf. Management of Data*, 1984, pp. 47–57.
- [@hellerstein1995] J. M. Hellerstein, J. F. Naughton, and A. Pfeffer, "Generalized search trees for database systems," in *Proc. 21st Int. Conf. Very Large Data Bases (VLDB)*, 1995, pp. 562–573.
- [@ramseyKnn] P. Ramsey et al., "A deep dive into PostGIS nearest neighbor search," Crunchy Data Blog. Accessed: Sep. 17, 2026. [Online]. Available: https://www.crunchydata.com/blog/a-deep-dive-into-postgis-nearest-neighbor-search
- [@redisGeo] Redis, "Redis Geospatial (GEOADD, GEOSEARCH)." Accessed: Sep. 17, 2026. [Online]. Available: https://redis.io/docs/latest/develop/data-types/geospatial/
- [@postgisDocs] PostGIS Project Steering Committee, "PostGIS Documentation: ST_DWithin, ST_Distance and the geography type." [Online]. Available: https://postgis.net/documentation/
- [@sinnott1984] R. W. Sinnott, "Virtues of the haversine," *Sky and Telescope*, vol. 68, no. 2, p. 159, 1984.
- [@haklay2008] M. Haklay and P. Weber, "OpenStreetMap: User-generated street maps," *IEEE Pervasive Computing*, vol. 7, no. 4, pp. 12–18, 2008.
- [@luxen2011] D. Luxen and C. Vetter, "Real-time routing with OpenStreetMap data," in *Proc. 19th ACM SIGSPATIAL Int. Conf. Advances in Geographic Information Systems*, 2011, pp. 513–516.
- [@baddeley2015] A. Baddeley, E. Rubak, and R. Turner, *Spatial Point Patterns: Methodology and Applications with R*. Boca Raton, FL, USA: CRC Press, 2015.

## Data management, distributed systems and software architecture

- [@grayReuter1993] J. Gray and A. Reuter, *Transaction Processing: Concepts and Techniques*. San Mateo, CA, USA: Morgan Kaufmann, 1993.
- [@berenson1995] H. Berenson, P. Bernstein, J. Gray, J. Melton, E. O'Neil, and P. O'Neil, "A critique of ANSI SQL isolation levels," in *Proc. ACM SIGMOD Int. Conf. Management of Data*, 1995, pp. 1–10.
- [@lamport1978] L. Lamport, "Time, clocks, and the ordering of events in a distributed system," *Communications of the ACM*, vol. 21, no. 7, pp. 558–565, 1978.
- [@helland2012] P. Helland, "Idempotence is not a medical condition," *Communications of the ACM*, vol. 55, no. 5, pp. 56–65, 2012.
- [@kleppmann2017] M. Kleppmann, *Designing Data-Intensive Applications*. Sebastopol, CA, USA: O'Reilly Media, 2017.
- [@fowlerES] M. Fowler, "Event Sourcing," martinfowler.com, 2005. [Online]. Available: https://martinfowler.com/eaaDev/EventSourcing.html
- [@hohpe2003] G. Hohpe and B. Woolf, *Enterprise Integration Patterns: Designing, Building, and Deploying Messaging Solutions*. Boston, MA, USA: Addison-Wesley, 2003.
- [@fielding2000] R. T. Fielding, "Architectural styles and the design of network-based software architectures," Ph.D. dissertation, Univ. California, Irvine, CA, USA, 2000.
- [@harel1987] D. Harel, "Statecharts: A visual formalism for complex systems," *Science of Computer Programming*, vol. 8, no. 3, pp. 231–274, 1987.
- [@saltzer1975] J. H. Saltzer and M. D. Schroeder, "The protection of information in computer systems," *Proceedings of the IEEE*, vol. 63, no. 9, pp. 1278–1308, 1975.
- [@cockburnHex] A. Cockburn, "Hexagonal architecture (ports and adapters)," 2005. [Online]. Available: https://alistair.cockburn.us/hexagonal-architecture/

## Standards and protocols

- [@rfc6455] I. Fette and A. Melnikov, "The WebSocket Protocol," IETF RFC 6455, Dec. 2011.
- [@rfc7519] M. Jones, J. Bradley, and N. Sakimura, "JSON Web Token (JWT)," IETF RFC 7519, May 2015.
- [@rfc2104] H. Krawczyk, M. Bellare, and R. Canetti, "HMAC: Keyed-hashing for message authentication," IETF RFC 2104, Feb. 1997.
- [@wcag22] World Wide Web Consortium (W3C), "Web Content Accessibility Guidelines (WCAG) 2.2," W3C Recommendation, Oct. 2023. [Online]. Available: https://www.w3.org/TR/WCAG22/
- [@owaspApi2023] OWASP Foundation, "OWASP API Security Top 10 – 2023." [Online]. Available: https://owasp.org/API-Security/editions/2023/en/0x11-t10/
- [@w3cSri] World Wide Web Consortium (W3C), "Subresource Integrity," W3C Recommendation, Jun. 2016. [Online]. Available: https://www.w3.org/TR/SRI/

## Human-computer interaction

- [@nielsen1994] J. Nielsen, "10 usability heuristics for user interface design," Nielsen Norman Group, 1994 (updated 2020). [Online]. Available: https://www.nngroup.com/articles/ten-usability-heuristics/
- [@brooke1996] J. Brooke, "SUS: A 'quick and dirty' usability scale," in *Usability Evaluation in Industry*, P. W. Jordan, B. Thomas, B. A. Weerdmeester, and I. L. McClelland, Eds. London, U.K.: Taylor & Francis, 1996, pp. 189–194.
- [@appleHig] Apple Inc., "Human Interface Guidelines: Accessibility." [Online]. Available: https://developer.apple.com/design/human-interface-guidelines/accessibility

## Platforms, frameworks and tools

- [@supabaseRls] Supabase, "Row Level Security—Performance and best practices," GitHub Discussion #14576. Accessed: Sep. 17, 2026. [Online]. Available: https://github.com/orgs/supabase/discussions/14576
- [@supabaseRealtimeLimits] Supabase, "Realtime limits." Accessed: Sep. 17, 2026. [Online]. Available: https://supabase.com/docs/guides/realtime/limits
- [@supabaseDocs] Supabase, "Supabase Documentation: Auth, Database Functions, Storage and Vault." [Online]. Available: https://supabase.com/docs
- [@postgresDocs] PostgreSQL Global Development Group, "PostgreSQL 17 Documentation: Row Security Policies, Explicit Locking (SELECT … FOR UPDATE SKIP LOCKED) and Advisory Locks." [Online]. Available: https://www.postgresql.org/docs/17/
- [@pgcron] Citus Data, "pg_cron: Run periodic jobs in PostgreSQL." [Online]. Available: https://github.com/citusdata/pg_cron
- [@pgnet] Supabase, "pg_net: A PostgreSQL extension for asynchronous HTTP requests." [Online]. Available: https://github.com/supabase/pg_net
- [@centrifugoDocs] Centrifugal Labs, "Centrifugo v5 Documentation: Channels, JWT authentication, history and recovery, server API." [Online]. Available: https://centrifugal.dev/docs/getting-started/introduction
- [@kongDocs] Kong Inc., "Kong Gateway (Open Source API Gateway) Documentation: DB-less mode and the Rate Limiting plugin." Accessed: Sep. 17, 2026. [Online]. Available: https://docs.konghq.com/gateway/
- [@xstateDocs] D. Khourshid, "XState: State machines and statecharts for JavaScript." Accessed: Sep. 17, 2026. [Online]. Available: https://stately.ai/docs/xstate
- [@zustand] Poimandres, "Zustand: Bear necessities for state management in React." [Online]. Available: https://github.com/pmndrs/zustand
- [@reactNative] Meta Platforms, Inc., "React Native Documentation." [Online]. Available: https://reactnative.dev/docs/getting-started
- [@expoDocs] Expo, "Expo Documentation: Expo Router, Location, TaskManager and SecureStore." [Online]. Available: https://docs.expo.dev/
- [@flutter] Google, "Flutter Documentation." [Online]. Available: https://docs.flutter.dev/
- [@leaflet] V. Agafonkin et al., "Leaflet: An open-source JavaScript library for interactive maps." [Online]. Available: https://leafletjs.com/
- [@turborepo] Vercel, "Turborepo Documentation." [Online]. Available: https://turborepo.com/docs
- [@pnpm] pnpm contributors, "pnpm: Fast, disk space efficient package manager." [Online]. Available: https://pnpm.io/
- [@vite] Vite contributors, "Vite: Next generation frontend tooling." [Online]. Available: https://vite.dev/
- [@nodeStripTypes] OpenJS Foundation, "Node.js Documentation: Modules—TypeScript (type stripping)." [Online]. Available: https://nodejs.org/api/typescript.html
- [@firebase] Google, "Firebase Documentation: Realtime Database and Cloud Firestore." [Online]. Available: https://firebase.google.com/docs
- [@caddy] Caddy contributors, "Caddy Documentation: Automatic HTTPS." [Online]. Available: https://caddyserver.com/docs/automatic-https
- [@openrouter] OpenRouter, "OpenRouter API Documentation." [Online]. Available: https://openrouter.ai/docs

## Statistics and simulation

- [@metropolis1949] N. Metropolis and S. Ulam, "The Monte Carlo method," *Journal of the American Statistical Association*, vol. 44, no. 247, pp. 335–341, 1949.
- [@knuth1997] D. E. Knuth, *The Art of Computer Programming, Vol. 2: Seminumerical Algorithms*, 3rd ed. Reading, MA, USA: Addison-Wesley, 1997.
- [@jain1991] R. Jain, *The Art of Computer Systems Performance Analysis: Techniques for Experimental Design, Measurement, Simulation, and Modeling*. New York, NY, USA: Wiley, 1991.
