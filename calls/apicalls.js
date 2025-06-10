const axios = require('axios');
module.exports = {
checkApi: async function(apikey) {   
        const response = await axios.get(`https://api.torn.com/v2/faction`,
            {
                headers: {
                'accept': 'application/json',
                'Authorization': `ApiKey ${apikey}`
            }
            });
        return response.data;
},
basicInfo: async function(apikey) {   
         const response = await axios.get(`https://api.torn.com/user/?selections=basic&key=${apikey}`);                 
        return response.data;
}
}
