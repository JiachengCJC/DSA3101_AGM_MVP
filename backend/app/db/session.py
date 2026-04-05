from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

"""
settings.DATABASE_URL: This uses the address we saw earlier (postgresql://...). 
It's like the GPS coordinates for the database.

pool_pre_ping=True: This is a "health check" feature. Before the app tries to use a connection, 
it "pings" the database to make sure it's still awake. If the connection has died 
(common if the database was idle), it transparently restarts it so your app doesn't crash.

--------------------------

autocommit=False: This is a safety feature. It means "Don't save changes to the database 
unless I explicitly say db.commit()." This prevents accidental data changes.

autoflush=False: This tells SQLAlchemy not to send data to the database until you are absolutely ready.

bind=engine: This connects this session factory to the specific "Pump" (Engine) we created above.
"""
engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True) # The physical connection that stays open
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

"""
This file is the Plumbing System of your backend. If the Database is a "Water Tank," 
this code sets up the Main Pump and the Faucets that your application uses to get data.

If you tried to talk to the database without an Engine, it would be like trying to call someone without a phone line or a cellular network. 
You might know their number (URL), and you might know what you want to say (Session), but you have no medium to carry the voice.

The Engine is that medium. It stays in the background, making sure the "line" is always clear and hasn't dropped (pool_pre_ping=True).

"""