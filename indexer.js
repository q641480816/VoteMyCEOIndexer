const os = require('os');
const cluster = require('cluster');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors')
const { flush, hsetAdd, hsetGet, hgetAll } = require('./redisClient');
const properties = require('./properties.json');
const numCPUs = Math.ceil(os.cpus().length / 2);
const { startListening, faucet, syncCamping } = require('./contractService');
const corsOptions = {
    origin: `http://localhost:7636`,
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
    app.use(cors(corsOptions));
    const jsonParser = bodyParser.json();

    app.get('/getFaucetHistory', async (req, res) => {
        const faucetHistoryList = await hgetAll(properties.tables.faucetHistory);
        if(faucetHistoryList.list){
            res.send(JSON.parse(faucetHistoryList.list));
        }else{
            res.send([]);
        }
    });

    app.get('/getCampaign', async (req, res) => {
        const campaign = await hgetAll(properties.tables.campaignMap);
        
        res.send(Object.values(campaign).map(c => {
            const campaign = JSON.parse(c);
            console.log(campaign)
            if(!isNaN(c)) return c;
            campaign.metadata = JSON.parse(campaign.metadata);
            return campaign;
        }).filter(c => c.campaignId !== undefined && c.campaignId !== null));
    })

    app.post('/faucet', jsonParser, async (req, res) => {
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

    app.get('/syncCampaign', async (req, res) => {
        try{
            await syncCamping();
            res.send('ok');
        }catch(err){
            res.status(500).send(err.message);
        }
    })

    app.listen(properties.port, '127.0.0.1', () => {
        console.log(`Indexer started at: ${properties.port}`)
    });
}