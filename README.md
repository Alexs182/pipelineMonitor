# PostgreSQL Monitoring API 
This is a NodeJS server providing various metrics about the Postgres database instance connected via [CORS](https://en.wikipedia.org/wiki/Cross-origin_resource_sharing). It's also designed to serve RESTful APIs that provide realtime monitoring and status of multiple databases, including size information for each table in a specific schema (e.g., 'public', 'bronze'), pipeline jobs statistics etc.. 

## Features:
- PostgreSQL Monitoring API allows you track your database connection pool's performance efficiently with metrics like connected state per db/connection point of view and latency info among others, based on realtime data points provided by the Postgres server.  
    - It supports multiple connections to different databases (each having a unique name). 
- RESTful APIs provide you access into PostgreSQL's internal status: `'/api/status`', 'all stats in one shot at once with all information about active and idle database sessions'. The result is then JSON formatted.  
    - It provides statistics on table row counts, query speed over time (average & total), failed jobs etc., within a specific schema ('public'). 
- Also able to fetch the current pipeline metrics like job count per status with details about recent completed and/or recently failing Jobs in Last 24 hours.  
    - Suitable for dashboards, you can refresh it manually via single button click (`'/api/all' endpoint).
    
## Quick Links:
- [GitHub Repo](https://github.com/username/repo)
- [API Documentation — Server side docs only]()    - Include the link of this section, explaining how you implemented these features in your project (Explain each part here).  
    
## Usage:
Please follow below steps to set up and run a server instance. For detailed instructions on running any command or script please refer [Running Server](#) — just replace `username` & `repo name` with the actual username/name of repository in GitHub containing this file, for example if it's called 'node-pg', then use:
```bash  
git clone https://github.com/{USERNAME}/{REPO_NAME}.git  # Clone Repo from Github to your local machine   
cd {REPO NAME}                            # Navigate into the cloned directory of our project      
npm install                                  # Install all dependencies        npm i     (if you have `package.json` file)  
node server.js                               # Run Node Server 