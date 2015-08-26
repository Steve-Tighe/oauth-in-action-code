var express = require("express");
var url = require("url");
var bodyParser = require('body-parser');
var randomstring = require("randomstring");
var cons = require('consolidate');
var nosql = require('nosql').load('database.nosql');
var __ = require('underscore');
var base64url = require('base64url');
var jose = require('./lib/jsrsasign.js');

var app = express();

app.use(bodyParser.urlencoded({ extended: true })); // support form-encoded bodies (for bearer tokens)

app.engine('html', cons.underscore);
app.set('view engine', 'html');
app.set('views', 'files/protectedResource');
app.set('json spaces', 4);

app.use('/', express.static('files/protectedResource'));

var resource = {
	"name": "Protected Resource",
	"description": "This data has been protected by OAuth 2.0"
};

var sharedTokenSecret = "shared token secret!";

var getAccessToken = function(req, res, next) {
	// check the auth header first
	var auth = req.headers['authorization'];
	var inToken = null;
	if (auth && auth.toLowerCase().indexOf('bearer') == 0) {
		inToken = auth.slice('bearer '.length);
	} else if (req.body && req.body.access_token) {
		// not in the header, check in the form body
		inToken = req.body.access_token;
	} else if (req.query && req.query.access_token) {
		inToken = req.query.access_token
	}
	
	console.log('Incoming token: %s', inToken);
	/*
	nosql.one(function(token) {
		if (token.access_token == inToken) {
			return token;	
		}
	}, function(err, token) {
		if (token) {
			console.log("We found a matching token: %s", inToken);
		} else {
			console.log('No matching token was found.');
		}
		req.access_token = token;
		next();
		return;
	});
	*/
	var isValid = jose.jws.JWS.verify(inToken, new Buffer(sharedTokenSecret).toString('hex'), ['HS256']);
	if (isValid) {
		console.log('Signature validated.');
		var tokenParts = inToken.split('.');
		var payload = JSON.parse(base64url.decode(tokenParts[1]));
		console.log('Payload', payload);
		if (payload.iss == 'http://localhost:9001/') {
			console.log('issuer OK');
			if ((Array.isArray(payload.aud) && _.contains(payload.aud, 'http://localhost:9002/')) || 
				payload.aud == 'http://localhost:9002/') {
				console.log('Audience OK');
				
				var now = Math.floor(Date.now() / 1000);
				
				if (payload.iat <= now) {
					console.log('issued-at OK');
					if (payload.exp >= now) {
						console.log('expiration OK');
						
						console.log('Token valid!');
		
						req.access_token = payload;
						
					}
				}
			}
			
		}
			

	}
	next();
	return;
	
};

var requireAccessToken = function(req, res, next) {
	if (req.access_token) {
		next();
	} else {
		res.status(401).end();
	}
};


var savedWords = [];

app.get('/words', getAccessToken, requireAccessToken, function(req, res) {
	if (__.contains(req.access_token.scope, 'read')) {
		res.json({words: savedWords.join(' '), timestamp: Date.now()});
	} else {
		res.set('WWW-Authenticate', 'Bearer realm=localhost:9002, error="insufficient_scope", scope="read"');
		res.status(403);
	}
});

app.post('/words', getAccessToken, requireAccessToken, function(req, res) {
	if (__.contains(req.access_token.scope, 'write')) {
		if (req.body.word) {
			savedWords.push(req.body.word);
		}
		res.status(201).end();
	} else {
		res.set('WWW-Authenticate', 'Bearer realm=localhost:9002, error="insufficient_scope", scope="write"');
		res.status(403);
	}
});

app.delete('/words', getAccessToken, requireAccessToken, function(req, res) {
	if (__.contains(req.access_token.scope, 'delete')) {
		savedWords.pop();
		res.status(201).end();
	} else {
		res.set('WWW-Authenticate', 'Bearer realm=localhost:9002, error="insufficient_scope", scope="delete"');
		res.status(403);
	}
});

app.get('/produce', getAccessToken, requireAccessToken, function(req, res) {
	var produce = {fruit: [], veggies: [], meats: []};
	if (__.contains(req.access_token.scope, 'fruit')) {
		produce.fruit = ['apple', 'banana', 'kiwi'];
	}
	if (__.contains(req.access_token.scope, 'veggies')) {
		produce.veggies = ['lettuce', 'onion', 'potato'];
	}
	if (__.contains(req.access_token.scope, 'meats')) {
		produce.meats = ['bacon', 'steak', 'chicken breast'];
	}
	console.log('Sending produce: ', produce);
	res.json(produce);
});

var aliceFavorites = {
	'movies': ['The Multidmensional Vector', 'Space Fights', 'Jewelry Boss'],
	'foods': ['bacon', 'pizza', 'bacon pizza'],
	'music': ['techno', 'industrial', 'alternative']
};

var bobFavories = {
	'movies': ['An Unrequited Love', 'Several Shades of Turquoise', 'Think Of The Children'],
	'foods': ['bacon', 'kale', 'gravel'],
	'music': ['baroque', 'ukulele', 'baroque ukulele']
};

app.get('/favorites', getAccessToken, requireAccessToken, function(req, res) {
	if (req.access_token.user == 'alice') {
		res.json({user: 'Alice', favorites: aliceFavorites});
	} else if (req.access_token.user == 'bob') {
		res.json({user: 'Bob', favorites: bobFavorites});
	} else {
		var unknown = {user: 'Unknown', favorites: {movies: [], foods: [], music: []}};
		res.json(unknown);
	}
});

app.post("/resource", getAccessToken, function(req, res){

	if (req.access_token) {
		res.json(resource);
	} else {
		res.status(401).end();
	}
	
});

var server = app.listen(9002, 'localhost', function () {
  var host = server.address().address;
  var port = server.address().port;

  console.log('OAuth Resource Server is listening at http://%s:%s', host, port);
});
 
