const axios = require('axios');

module.exports = {
        checkApi: async function (apikey) {
                const response = await axios.get(`https://api.torn.com/v2/faction`, {
                        headers: {
                                'accept': 'application/json',
                                'Authorization': `ApiKey ${apikey}`
                        }
                });
                return response.data;
        },

        basicInfo: async function (apikey) {
                const response = await axios.get(`https://api.torn.com/user/?selections=basic&key=${apikey}`);
                return response.data;
        },

        getFactionMembers: async function (apikey) {
                const response = await axios.get(`https://api.torn.com/faction/?selections=basic&key=${apikey}`);
                return response.data.members;
        },

        getRankedWars: async function (apikey) {
                const response = await axios.get(`https://api.torn.com/v2/faction/rankedwars?sort=DESC`, {
                        headers: {
                                'accept': 'application/json',
                                'Authorization': `ApiKey ${apikey}`
                        }
                });
                return response.data.rankedwars;
        },

        getFactionBasic: async function (apikey, factionId) {
                const response = await axios.get(`https://api.torn.com/v2/faction/${factionId}/members`, {
                        headers: {
                                'accept': 'application/json',
                                'Authorization': `ApiKey ${apikey}`
                        }
                });
                return response.data;
        }

};
