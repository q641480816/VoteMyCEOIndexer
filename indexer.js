const os = require('os');
const cluster = require('cluster');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors')
const { flush, hsetAdd, hsetGet, hgetAll } = require('./redisClient');
const properties = require('./properties.json');
// const numCPUs = Math.ceil(os.cpus().length / 2);
const numCPUs = 2;
const { startListening, faucet, syncCamping } = require('./contractService');
const path = require('path');
const corsOptions = {
    origin: [`http://localhost:8722`, properties.serverUrl],
    optionsSuccessStatus: 200
}

const test = async (contract, id) => {
    console.log(await contract.getCampaign(id));
}

if (cluster.isPrimary) {
    for (let i = 0; i < numCPUs; i++) {
        const worker = cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        cluster.fork();
    });

    // startListening();

} else {
    const app = express();
    const apiRouter = express.Router();
    const staticFilesPath = path.join(__dirname, 'public');

    // Serve static files using the apiRouter
    app.use('/faucet', express.static(staticFilesPath));
    app.use('/indexer', apiRouter);
    app.use(cors(corsOptions));
    const jsonParser = bodyParser.json();

    apiRouter.get('/getFaucetHistory', async (req, res) => {
        const faucetHistoryList = await hgetAll(properties.tables.faucetHistory);
        if(faucetHistoryList.list){
            res.send(JSON.parse(faucetHistoryList.list));
        }else{
            res.send([]);
        }
    });

    apiRouter.get('/getCampaign', async (req, res) => {
        const campaign = await hgetAll(properties.tables.campaignMap);
        
        res.send(Object.values(campaign).map(c => {
            const campaign = JSON.parse(c);
            console.log(campaign)
            if(!isNaN(c)) return c;
            campaign.metadata = JSON.parse(campaign.metadata);
            return campaign;
        }).filter(c => c.campaignId !== undefined && c.campaignId !== null));
    })

    apiRouter.post('/faucet', jsonParser, async (req, res) => {
        try {
            await faucet(req.body.address);
            res.status(200).send(`fauceted`)
        } catch (err) {
            console.log(err);
            res.status(500).send({
                reason: err.message
            });
        }
    })

    apiRouter.get('/syncCampaign', async (req, res) => {
        try{
            await syncCamping();
            res.send('ok');
        }catch(err){
            res.status(500).send(err.message);
        }
    })

    app.listen(properties.port, () => {
        console.log(`Indexer started at: ${properties.port}`)
    });
}